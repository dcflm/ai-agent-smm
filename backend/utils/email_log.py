"""
Email decision log — records what happened with the review-notification email
after each pipeline run (sent / failed / skipped and WHY), stored in Supabase
Storage so the Schedule page can show it. Removes the "I didn't get the email
and don't know why" black box.
"""
import json
import threading
from datetime import datetime, timezone

EMAIL_LOG_BUCKET = "settings"
EMAIL_LOG_FILE = "email_log.json"
MAX_ENTRIES = 20

_lock = threading.Lock()


def _get_storage():
    from backend.api.settings import _get_storage as _s
    return _s()


def record_email_event(event: str, detail: str, to: str = "", resend_id: str = "") -> None:
    """event: 'sent' | 'failed' | 'skipped' | 'delivery'."""
    with _lock:
        try:
            try:
                raw = _get_storage().from_(EMAIL_LOG_BUCKET).download(EMAIL_LOG_FILE)
                entries = json.loads(raw)
            except Exception:
                entries = []
            entries.insert(0, {
                "at": datetime.now(timezone.utc).isoformat(),
                "event": event,
                "to": to,
                "detail": detail[:300],
                "resend_id": resend_id,
            })
            entries = entries[:MAX_ENTRIES]
            storage = _get_storage()
            try:
                storage.create_bucket(EMAIL_LOG_BUCKET, options={"public": False})
            except Exception:
                pass
            storage.from_(EMAIL_LOG_BUCKET).upload(
                path=EMAIL_LOG_FILE,
                file=json.dumps(entries, indent=2).encode(),
                file_options={"content-type": "application/json", "upsert": "true"},
            )
        except Exception as e:
            print(f"[email_log] Persist failed: {e!r}")


def get_email_log(limit: int = 5) -> list[dict]:
    try:
        raw = _get_storage().from_(EMAIL_LOG_BUCKET).download(EMAIL_LOG_FILE)
        return json.loads(raw)[:limit]
    except Exception:
        return []
