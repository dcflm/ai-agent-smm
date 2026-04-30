"""
Schedule settings - controls which days/time the agent auto-generates posts.
Settings are persisted to schedule_settings.json in the project root.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "../../schedule_settings.json")

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
}


class ScheduleSettings(BaseModel):
    enabled: bool
    days: list[str]
    time: str        # "HH:MM"
    timezone: str


def load_settings() -> dict:
    try:
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    except Exception:
        return DEFAULT_SETTINGS.copy()


def _save_settings(data: dict) -> None:
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def apply_schedule_to_scheduler(settings: dict) -> None:
    """Sync APScheduler jobs to the saved settings."""
    from backend.scheduler.tasks import scheduler, run_news_pipeline
    from apscheduler.triggers.cron import CronTrigger

    # Remove all previously scheduled auto-post jobs
    for job in scheduler.get_jobs():
        if job.id.startswith("auto_post_"):
            scheduler.remove_job(job.id)

    if not settings.get("enabled"):
        return

    time_str = settings.get("time", "08:00")
    timezone = settings.get("timezone", "Europe/Zurich")
    try:
        hour, minute = map(int, time_str.split(":"))
    except ValueError:
        raise ValueError(f"Invalid time format: {time_str!r}. Use HH:MM.")

    for day in settings.get("days", []):
        day_abbr = DAY_MAP.get(day.lower())
        if not day_abbr:
            continue
        scheduler.add_job(
            run_news_pipeline,
            CronTrigger(day_of_week=day_abbr, hour=hour, minute=minute, timezone=timezone),
            id=f"auto_post_{day.lower()}",
            replace_existing=True,
            misfire_grace_time=60,
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

    _save_settings(data)

    try:
        apply_schedule_to_scheduler(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Settings saved but scheduler update failed: {e}")

    return {"message": "Schedule saved and applied", **data}


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
