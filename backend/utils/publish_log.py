"""
LinkedIn publish outcome log — stored in Supabase Storage (settings bucket)
so results survive Render restarts. Same pattern as usage_tracker.py.

Records the outcome of every publish attempt so the UI can show WHY a post
is 'approved' instead of 'published' (failed vs LinkedIn not configured).
"""
import json
import threading
from datetime import datetime, timezone

PUBLISH_BUCKET = "settings"
PUBLISH_FILE = "publish_log.json"
MAX_ENTRIES = 100

_lock = threading.Lock()


def _get_storage():
    from backend.api.settings import _get_storage as _s
    return _s()


def _load() -> dict:
    try:
        raw = _get_storage().from_(PUBLISH_BUCKET).download(PUBLISH_FILE)
        return json.loads(raw)
    except Exception:
        return {}


def _save(data: dict) -> None:
    try:
        storage = _get_storage()
        try:
            storage.create_bucket(PUBLISH_BUCKET, options={"public": False})
        except Exception:
            pass
        storage.from_(PUBLISH_BUCKET).upload(
            path=PUBLISH_FILE,
            file=json.dumps(data, indent=2).encode(),
            file_options={"content-type": "application/json", "upsert": "true"},
        )
    except Exception as e:
        print(f"[publish_log] Persist failed: {e!r}")


def record_publish_result(post_id: str, ok: bool, detail: str) -> None:
    """Record the outcome of a LinkedIn publish attempt for a post."""
    with _lock:
        data = _load()
        data[post_id] = {
            "ok": ok,
            "detail": detail[:300],
            "at": datetime.now(timezone.utc).isoformat(),
        }
        # Keep only the newest MAX_ENTRIES
        if len(data) > MAX_ENTRIES:
            oldest = sorted(data.items(), key=lambda kv: kv[1].get("at", ""))
            for k, _ in oldest[: len(data) - MAX_ENTRIES]:
                del data[k]
        _save(data)


def get_publish_result(post_id: str) -> dict | None:
    """Return {'ok', 'detail', 'at'} for a post, or None if never attempted."""
    return _load().get(post_id)
