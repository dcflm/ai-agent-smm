"""
API Usage Tracker - logs every external API call to Supabase Storage.
Survives Render restarts (no more ephemeral filesystem loss).

Design:
- _cache is the in-memory accumulator (fast reads/writes during the session)
- On first access, loads from Supabase Storage to restore the previous session's counts
- On every write, persists back to Supabase Storage
- Thread-safe with _lock
"""
import json
import copy
import threading
from datetime import datetime, timezone

# Supabase Storage location (reuses the same 'settings' bucket as system_prompt)
USAGE_BUCKET = "settings"
USAGE_FILE_PATH = "api_usage_log.json"

_lock = threading.Lock()
_cache: dict | None = None

# Pricing constants (USD per token/unit as of 2025)
ANTHROPIC_INPUT_PRICE_PER_M = 3.00    # claude-sonnet-4-x: $3.00 / 1M input tokens
ANTHROPIC_OUTPUT_PRICE_PER_M = 15.00  # claude-sonnet-4-x: $15.00 / 1M output tokens
OPENAI_EMBED_PRICE_PER_M = 0.02       # text-embedding-3-small: $0.02 / 1M tokens
TAVILY_PRICE_PER_SEARCH = 0.001       # Tavily paid plan ~$0.001 / search (estimate)
NANO_BANANA_PRICE_PER_IMAGE = 0.04    # Nano Banana ~$0.04 / image (estimate)

_DEFAULT: dict = {
    "anthropic": {
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_calls": 0,
        "by_type": {},
    },
    "openai": {
        "total_tokens": 0,
        "total_calls": 0,
    },
    "tavily": {
        "total_searches": 0,
    },
    "nano_banana": {
        "total_attempted": 0,
        "total_succeeded": 0,
    },
    "last_updated": None,
}


def _get_storage():
    from backend.api.settings import _get_storage as _s
    return _s()


def _ensure_bucket(storage) -> None:
    try:
        storage.create_bucket(USAGE_BUCKET, options={"public": False})
    except Exception:
        pass  # Already exists


def _ensure_loaded() -> None:
    """Load from Supabase Storage on first access (restore previous session counts)."""
    global _cache
    if _cache is not None:
        return
    try:
        storage = _get_storage()
        raw = storage.from_(USAGE_BUCKET).download(USAGE_FILE_PATH)
        data = json.loads(raw)
        # Backfill any keys added since last save
        for key, val in _DEFAULT.items():
            if key not in data:
                data[key] = copy.deepcopy(val)
        _cache = data
    except Exception:
        # First run or Supabase error — start fresh
        _cache = copy.deepcopy(_DEFAULT)


def _load() -> dict:
    _ensure_loaded()
    return copy.deepcopy(_cache)


def _save(data: dict) -> None:
    global _cache
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    _cache = copy.deepcopy(data)
    try:
        storage = _get_storage()
        _ensure_bucket(storage)
        storage.from_(USAGE_BUCKET).upload(
            path=USAGE_FILE_PATH,
            file=json.dumps(data, indent=2).encode(),
            file_options={"content-type": "application/json", "upsert": "true"},
        )
    except Exception as e:
        print(f"[usage_tracker] Failed to persist to Supabase: {e}")


def track_anthropic(call_type: str, input_tokens: int, output_tokens: int) -> None:
    """Log an Anthropic API call. call_type e.g. 'generation', 'chat', 'refine_prompt'."""
    with _lock:
        data = _load()
        a = data["anthropic"]
        a["total_input_tokens"] += input_tokens
        a["total_output_tokens"] += output_tokens
        a["total_calls"] += 1
        by_type = a.setdefault("by_type", {})
        t = by_type.setdefault(call_type, {"calls": 0, "input_tokens": 0, "output_tokens": 0})
        t["calls"] += 1
        t["input_tokens"] += input_tokens
        t["output_tokens"] += output_tokens
        _save(data)


def track_openai(tokens: int) -> None:
    """Log an OpenAI embedding call."""
    with _lock:
        data = _load()
        data["openai"]["total_tokens"] += tokens
        data["openai"]["total_calls"] += 1
        _save(data)


def track_tavily() -> None:
    """Log a Tavily search."""
    with _lock:
        data = _load()
        data["tavily"]["total_searches"] += 1
        _save(data)


def track_nano_banana(succeeded: bool) -> None:
    """Log a Nano Banana image generation attempt."""
    with _lock:
        data = _load()
        data["nano_banana"]["total_attempted"] += 1
        if succeeded:
            data["nano_banana"]["total_succeeded"] += 1
        _save(data)


def get_usage() -> dict:
    """Return the full usage log."""
    with _lock:
        return _load()


def reset_usage() -> None:
    """Reset all counters to zero and persist the clean slate to Supabase Storage."""
    global _cache
    with _lock:
        _cache = copy.deepcopy(_DEFAULT)
        _save(copy.deepcopy(_DEFAULT))


def calculate_costs(data: dict) -> dict:
    """Calculate estimated USD costs from usage data."""
    a = data["anthropic"]
    anthropic_cost = (
        (a["total_input_tokens"] / 1_000_000) * ANTHROPIC_INPUT_PRICE_PER_M
        + (a["total_output_tokens"] / 1_000_000) * ANTHROPIC_OUTPUT_PRICE_PER_M
    )

    openai_cost = (data["openai"]["total_tokens"] / 1_000_000) * OPENAI_EMBED_PRICE_PER_M
    tavily_cost = data["tavily"]["total_searches"] * TAVILY_PRICE_PER_SEARCH
    nano_cost = data["nano_banana"]["total_succeeded"] * NANO_BANANA_PRICE_PER_IMAGE

    return {
        "anthropic_usd": round(anthropic_cost, 4),
        "openai_usd": round(openai_cost, 4),
        "tavily_usd": round(tavily_cost, 4),
        "nano_banana_usd": round(nano_cost, 4),
        "total_usd": round(anthropic_cost + openai_cost + tavily_cost + nano_cost, 4),
    }
