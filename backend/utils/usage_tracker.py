"""
API Usage Tracker - logs every external API call to api_usage_log.json.
Used to estimate costs and monitor credit consumption across services.
"""
import json
import os
import threading
from datetime import datetime, timezone

USAGE_FILE = os.path.join(os.path.dirname(__file__), "../../api_usage_log.json")
_lock = threading.Lock()

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


def _load() -> dict:
    try:
        with open(USAGE_FILE) as f:
            data = json.load(f)
            # Backfill any missing keys from default
            for key, val in _DEFAULT.items():
                if key not in data:
                    data[key] = val
            return data
    except Exception:
        import copy
        return copy.deepcopy(_DEFAULT)


def _save(data: dict) -> None:
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(USAGE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[usage_tracker] Failed to save: {e}")


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
    return _load()


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
