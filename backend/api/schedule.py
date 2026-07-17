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
}


class ScheduleSettings(BaseModel):
    enabled: bool
    days: list[str]
    time: str        # "HH:MM"
    timezone: str
    notify_enabled: bool = False   # email after each scheduled generation
    notify_email: str = ""         # remembered even when notify_enabled is off


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


def apply_schedule_to_scheduler(settings: dict) -> None:
    """Sync APScheduler generation jobs to the saved settings. The review email
    is sent by the pipeline itself right after generation (see tasks.py)."""
    from backend.scheduler.tasks import scheduler, run_news_pipeline
    from apscheduler.triggers.cron import CronTrigger

    timezone = settings.get("timezone", "Europe/Zurich")

    for job in scheduler.get_jobs():
        if job.id.startswith("auto_post_"):
            scheduler.remove_job(job.id)

    # Clean up the digest job from the previous design, if present
    try:
        scheduler.remove_job("notify_digest")
    except Exception:
        pass

    if not settings.get("enabled"):
        return

    hour, minute = _parse_hhmm(settings.get("time", "08:00"), "time")
    for day in settings.get("days", []):
        day_abbr = DAY_MAP.get(day.lower())
        if not day_abbr:
            continue
        scheduler.add_job(
            run_news_pipeline,
            CronTrigger(day_of_week=day_abbr, hour=hour, minute=minute, timezone=timezone),
            id=f"auto_post_{day.lower()}",
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

    _save_settings(data)

    try:
        apply_schedule_to_scheduler(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Settings saved but scheduler update failed: {e}")

    return {"message": "Schedule saved and applied", **data}


@router.get("/email-status")
async def email_status():
    """Report whether server-side email sending (Resend) is configured and working.
    Mirrors the /linkedin/status pattern so the UI can show it proactively."""
    from backend.config import get_settings
    import httpx

    s = get_settings()
    if not s.resend_api_key:
        return {
            "configured": False,
            "connected": False,
            "from": s.email_from,
            "detail": "RESEND_API_KEY is not set on the server. Add it in the Render dashboard to enable email notifications.",
        }
    # Cheap authenticated call to validate the key without sending anything
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.resend.com/domains",
                headers={"Authorization": f"Bearer {s.resend_api_key}"},
            )
        if r.status_code == 200:
            return {"configured": True, "connected": True, "from": s.email_from,
                    "detail": "Email delivery is ready."}
        if r.status_code in (401, 403):
            return {"configured": True, "connected": False, "from": s.email_from,
                    "detail": "The RESEND_API_KEY on the server was rejected — generate a new key at resend.com."}
        return {"configured": True, "connected": False, "from": s.email_from,
                "detail": f"Resend returned HTTP {r.status_code}."}
    except Exception as e:
        return {"configured": True, "connected": False, "from": s.email_from,
                "detail": f"Could not reach Resend: {str(e)[:120]}"}


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
    """Return the next scheduled run times for preview."""
    from backend.scheduler.tasks import scheduler
    jobs = []
    for job in scheduler.get_jobs():
        if job.id.startswith("auto_post_"):
            jobs.append({
                "day": job.id.replace("auto_post_", "").capitalize(),
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })
    return sorted(jobs, key=lambda j: j["next_run"] or "")
