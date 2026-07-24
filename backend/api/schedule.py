"""
Schedule settings - controls which days/time the agent auto-generates posts.
Settings are persisted to Supabase Storage (bucket: settings, file: schedule_settings.json)
so they survive Render restarts and deploys.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import json
import re

SCHEDULE_BUCKET = "settings"
SCHEDULE_FILE = "schedule_settings.json"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

router = APIRouter(prefix="/schedule", tags=["schedule"])

DAY_MAP = {
    "monday": "mon", "tuesday": "tue", "wednesday": "wed",
    "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
}

DEFAULT_SETTINGS: dict = {
    "enabled": False,
    "days": ["monday", "wednesday", "friday"],
    "time": "08:00",
    "timezone": "Europe/Zurich",
    "notify_enabled": False,
    "notify_email": "",
    "extra_dates": [],   # one-off generation dates ("YYYY-MM-DD") on top of the weekly pattern
    "skip_dates": [],    # dates excluded despite matching the weekly pattern
}


class ScheduleSettings(BaseModel):
    enabled: bool
    days: list[str]
    time: str        # "HH:MM"
    timezone: str
    notify_enabled: bool = False   # email after each scheduled generation
    notify_email: str = ""         # remembered even when notify_enabled is off
    extra_dates: list[str] = []    # per-date overrides set from the dashboard calendar
    skip_dates: list[str] = []


def load_settings() -> dict:
    try:
        from backend.api.settings import _get_storage
        storage = _get_storage()
        raw = storage.from_(SCHEDULE_BUCKET).download(SCHEDULE_FILE)
        data = json.loads(raw)
        # Backfill keys added since the file was last written
        for k, v in DEFAULT_SETTINGS.items():
            data.setdefault(k, v)
        return data
    except Exception:
        return DEFAULT_SETTINGS.copy()


def _save_settings(data: dict) -> None:
    try:
        from backend.api.settings import _get_storage, _ensure_bucket
        storage = _get_storage()
        _ensure_bucket(storage)
        storage.from_(SCHEDULE_BUCKET).upload(
            path=SCHEDULE_FILE,
            file=json.dumps(data, indent=2).encode(),
            file_options={"content-type": "application/json", "upsert": "true"},
        )
    except Exception as e:
        print(f"[schedule] Failed to persist settings to Supabase: {e}")


def _parse_hhmm(value: str, field: str) -> tuple[int, int]:
    try:
        hour, minute = map(int, value.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour, minute
    except ValueError:
        raise ValueError(f"Invalid {field} format: {value!r}. Use HH:MM.")


def _is_generation_date(settings: dict, date) -> bool:
    """Decide whether posts should be generated on `date` (a datetime.date):
    weekly pattern ± per-date overrides from the dashboard calendar."""
    key = date.strftime("%Y-%m-%d")
    if key in (settings.get("skip_dates") or []):
        return False
    if key in (settings.get("extra_dates") or []):
        return True
    weekday = date.strftime("%A").lower()
    return weekday in [d.lower() for d in (settings.get("days") or [])]


def apply_schedule_to_scheduler(settings: dict) -> None:
    """Sync APScheduler to the saved settings. One daily job fires at the
    configured time and decides at runtime whether today is a generation date
    (weekly pattern ± per-date overrides). The review email is sent by the
    pipeline itself right after generation (see tasks.py)."""
    from backend.scheduler.tasks import scheduler, run_scheduled_generation
    from apscheduler.triggers.cron import CronTrigger

    timezone = settings.get("timezone", "Europe/Zurich")

    # Remove the daily job and any legacy per-weekday/digest jobs
    for job in scheduler.get_jobs():
        if job.id.startswith("auto_post_") or job.id == "notify_digest":
            scheduler.remove_job(job.id)

    if not settings.get("enabled"):
        return

    hour, minute = _parse_hhmm(settings.get("time", "08:00"), "time")
    scheduler.add_job(
        run_scheduled_generation,
        CronTrigger(hour=hour, minute=minute, timezone=timezone),
        id="auto_post_daily",
        replace_existing=True,
        # Wide grace: on Render's free tier the service can be briefly asleep at
        # the exact trigger minute; allow a late wake (up to 1h) to still fire.
        misfire_grace_time=3600,
        coalesce=True,
    )


@router.get("/settings")
async def get_schedule_settings():
    return load_settings()


@router.post("/settings")
async def save_schedule_settings(body: ScheduleSettings):
    data = body.model_dump()

    # Validate days
    invalid = [d for d in data["days"] if d.lower() not in DAY_MAP]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid days: {invalid}")

    # Validate notification email if provided. The address is always kept
    # (even when notify_enabled is off) so it survives toggling on/off.
    email = (data.get("notify_email") or "").strip()
    if email and not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address")
    data["notify_email"] = email
    # If notifications are on, an address is required
    if data.get("notify_enabled") and not email:
        raise HTTPException(status_code=422, detail="Enter an email address to enable notifications")

    # Validate the time up-front so bad input is a clean 422, not a 500
    try:
        _parse_hhmm(data.get("time", "08:00"), "time")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Validate per-date overrides and prune dates already in the past
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    try:
        tz = ZoneInfo(data.get("timezone", "Europe/Zurich"))
    except Exception:
        raise HTTPException(status_code=422, detail=f"Unknown timezone: {data.get('timezone')!r}")
    today_key = datetime.now(tz).strftime("%Y-%m-%d")
    for field in ("extra_dates", "skip_dates"):
        cleaned = []
        for d in data.get(field) or []:
            try:
                datetime.strptime(d, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Invalid date {d!r} in {field}. Use YYYY-MM-DD.")
            if d >= today_key:
                cleaned.append(d)
        data[field] = sorted(set(cleaned))

    _save_settings(data)

    try:
        apply_schedule_to_scheduler(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Settings saved but scheduler update failed: {e}")

    return {"message": "Schedule saved and applied", **data}


@router.get("/email-status")
async def email_status():
    """Operator/debug: report whether server-side email sending (Brevo) is
    configured and the API key works. Not shown in the end-user UI."""
    from backend.config import get_settings
    import httpx

    s = get_settings()
    if not s.brevo_api_key or not s.email_from:
        missing = "BREVO_API_KEY" if not s.brevo_api_key else "EMAIL_FROM (verified sender)"
        return {
            "configured": False,
            "connected": False,
            "from": s.email_from,
            "detail": f"{missing} is not set on the server. Add it in the Render dashboard to enable email notifications.",
        }
    # Cheap authenticated call to validate the key without sending anything
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.brevo.com/v3/account",
                headers={"api-key": s.brevo_api_key, "accept": "application/json"},
            )
        if r.status_code == 200:
            return {"configured": True, "connected": True, "from": s.email_from,
                    "detail": "Email delivery is ready."}
        if r.status_code in (401, 403):
            return {"configured": True, "connected": False, "from": s.email_from,
                    "detail": "The BREVO_API_KEY on the server was rejected — generate a new key at brevo.com."}
        return {"configured": True, "connected": False, "from": s.email_from,
                "detail": f"Brevo returned HTTP {r.status_code}."}
    except Exception as e:
        return {"configured": True, "connected": False, "from": s.email_from,
                "detail": f"Could not reach Brevo: {str(e)[:120]}"}


@router.get("/email-log")
async def email_log(limit: int = 5):
    """Recent review-email outcomes (sent / failed / skipped + why)."""
    import asyncio
    from backend.utils.email_log import get_email_log
    return await asyncio.to_thread(get_email_log, limit)


class TestEmailRequest(BaseModel):
    email: str = ""


@router.post("/test-email")
async def test_email(body: TestEmailRequest):
    """Send a one-off test email to verify delivery is configured correctly.
    Uses the address in the request, else the saved notify_email."""
    to = (body.email or "").strip() or (load_settings().get("notify_email") or "").strip()
    if not to:
        raise HTTPException(status_code=422, detail="Enter an email address first")
    if not _EMAIL_RE.match(to):
        raise HTTPException(status_code=422, detail="Please enter a valid email address")
    from backend.utils.email_sender import send_test_email
    ok, detail = await send_test_email(to)
    return {"ok": ok, "detail": detail}


@router.post("/trigger-now")
async def trigger_now(background_tasks: BackgroundTasks):
    """Manually trigger the news pipeline immediately (for testing)."""
    from backend.scheduler.tasks import run_news_pipeline
    background_tasks.add_task(run_news_pipeline)
    return {"message": "Pipeline triggered - post will appear in ~1-3 minutes"}


@router.get("/next-runs")
async def get_next_runs():
    """Next scheduled generation dates, computed from the weekly pattern plus
    the per-date overrides (extra/skip) set on the dashboard calendar."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    s = load_settings()
    if not s.get("enabled"):
        return []
    try:
        tz = ZoneInfo(s.get("timezone", "Europe/Zurich"))
        hour, minute = _parse_hhmm(s.get("time", "08:00"), "time")
    except Exception:
        return []

    now = datetime.now(tz)
    runs = []
    for i in range(60):
        date = (now + timedelta(days=i)).date()
        if not _is_generation_date(s, date):
            continue
        run_dt = datetime(date.year, date.month, date.day, hour, minute, tzinfo=tz)
        if run_dt <= now:
            continue
        runs.append({"day": date.strftime("%A"), "next_run": run_dt.isoformat()})
        if len(runs) >= 7:
            break
    return runs
