"""
Credits & API Usage endpoint.
Returns aggregated usage stats, estimated costs, and live API key status checks.
"""
from fastapi import APIRouter
import httpx
import asyncio
from backend.utils.usage_tracker import get_usage, calculate_costs
from backend.config import get_settings

router = APIRouter(prefix="/credits", tags=["credits"])

PRICING_INFO = {
    "anthropic":   {"model": "claude-sonnet-4-x",        "input_per_1m": 3.00, "output_per_1m": 15.00, "unit": "tokens",   "dashboard_url": "https://console.anthropic.com/settings/billing"},
    "openai":      {"model": "text-embedding-3-small",    "price_per_1m": 0.02,                         "unit": "tokens",   "dashboard_url": "https://platform.openai.com/usage"},
    "tavily":      {"model": "Advanced Search",           "price_per_search": 0.001,                    "unit": "searches", "dashboard_url": "https://app.tavily.com/home"},
    "nano_banana": {"model": "Text-to-Image",             "price_per_image": 0.04,                      "unit": "images",   "dashboard_url": "https://nanobananaapi.ai/dashboard"},
}


# ── Live status checks ────────────────────────────────────────────────────────

async def _check_anthropic(key: str) -> dict:
    """
    Ping the token-count endpoint (free, no credits consumed).
    If credits are exhausted the API returns a 400 with 'credit balance is too low'.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages/count_tokens",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "hi"}]},
            )
        if r.status_code == 200:
            return {"status": "ok", "detail": "API key valid, credits available"}
        body = r.json()
        msg = body.get("error", {}).get("message", "") or str(body)
        if "credit balance" in msg.lower() or "insufficient" in msg.lower():
            return {"status": "no_credits", "detail": "Out of credits - top up at console.anthropic.com"}
        if "auth" in msg.lower() or r.status_code == 401:
            return {"status": "invalid_key", "detail": "Invalid API key"}
        return {"status": "error", "detail": msg[:120]}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:120]}


async def _check_openai(key: str) -> dict:
    """List models — free call that verifies key and credit availability."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        if r.status_code == 200:
            count = len(r.json().get("data", []))
            return {"status": "ok", "detail": f"API key valid - {count} models accessible"}
        body = r.json()
        msg = body.get("error", {}).get("message", "") or str(body)
        if "quota" in msg.lower() or "billing" in msg.lower():
            return {"status": "no_credits", "detail": "Quota exceeded - check billing at platform.openai.com"}
        if r.status_code == 401:
            return {"status": "invalid_key", "detail": "Invalid API key"}
        return {"status": "error", "detail": msg[:120]}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:120]}


async def _check_tavily(key: str) -> dict:
    """Make a minimal 1-result search to verify the key and credits."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": "test", "max_results": 1, "search_depth": "basic"},
            )
        if r.status_code == 200:
            data = r.json()
            results = len(data.get("results", []))
            return {"status": "ok", "detail": f"API key valid, search working ({results} result)"}
        body = r.json()
        msg = str(body.get("detail") or body.get("message") or body)
        if "credit" in msg.lower() or "limit" in msg.lower() or "quota" in msg.lower():
            return {"status": "no_credits", "detail": "Credits exhausted - check app.tavily.com"}
        if r.status_code in (401, 403):
            return {"status": "invalid_key", "detail": "Invalid API key"}
        return {"status": "error", "detail": msg[:120]}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:120]}


async def _check_nano_banana(key: str) -> dict:
    """Submit a tiny request and check the response code / error message."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.nanobananaapi.ai/api/v1/nanobanana/generate",
                headers={"apikey": key, "Content-Type": "application/json"},
                json={"prompt": "__credits_check__", "type": "TEXTTOIAMGE", "numImages": 1, "image_size": "1:1", "callBackUrl": ""},
            )
        body = r.json()
        code = body.get("code") or r.status_code
        msg = str(body.get("msg") or body.get("message") or "")

        if code in (200, 0) or r.status_code == 200:
            return {"status": "ok", "detail": "API key valid, credits available"}
        if "insufficient" in msg.lower() or "credit" in msg.lower() or "balance" in msg.lower():
            return {"status": "no_credits", "detail": "Insufficient credits - top up at nanobananaapi.ai"}
        if "unauthorized" in msg.lower() or "auth" in msg.lower() or code == 401:
            return {"status": "invalid_key", "detail": "Invalid API key"}
        # A 402 / task queued also means the key works
        if r.status_code in (200, 201, 202) or code in (200, 201):
            return {"status": "ok", "detail": "API key valid"}
        return {"status": "ok", "detail": f"Key accepted (code={code})"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:120]}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_api_status():
    """Run live checks against all four APIs in parallel. Returns connection status."""
    s = get_settings()
    results = await asyncio.gather(
        _check_anthropic(s.anthropic_api_key or ""),
        _check_openai(s.openai_api_key or ""),
        _check_tavily(s.tavily_api_key or ""),
        _check_nano_banana(s.nano_banana_api_key or ""),
        return_exceptions=True,
    )
    def _safe(r):
        if isinstance(r, Exception):
            return {"status": "error", "detail": str(r)[:120]}
        return r

    return {
        "anthropic":   {**_safe(results[0]), **PRICING_INFO["anthropic"]},
        "openai":      {**_safe(results[1]), **PRICING_INFO["openai"]},
        "tavily":      {**_safe(results[2]), **PRICING_INFO["tavily"]},
        "nano_banana": {**_safe(results[3]), **PRICING_INFO["nano_banana"]},
    }


@router.get("/usage")
async def get_credits_usage():
    """Return all locally tracked API usage with estimated costs."""
    data = get_usage()
    costs = calculate_costs(data)
    a = data["anthropic"]

    return {
        "last_updated": data.get("last_updated"),
        "total_estimated_cost_usd": costs["total_usd"],
        "services": {
            "anthropic": {
                "total_calls": a["total_calls"],
                "total_input_tokens": a["total_input_tokens"],
                "total_output_tokens": a["total_output_tokens"],
                "total_tokens": a["total_input_tokens"] + a["total_output_tokens"],
                "estimated_cost_usd": costs["anthropic_usd"],
                "by_type": a.get("by_type", {}),
                **PRICING_INFO["anthropic"],
            },
            "openai": {
                "total_calls": data["openai"]["total_calls"],
                "total_tokens": data["openai"]["total_tokens"],
                "estimated_cost_usd": costs["openai_usd"],
                **PRICING_INFO["openai"],
            },
            "tavily": {
                "total_searches": data["tavily"]["total_searches"],
                "estimated_cost_usd": costs["tavily_usd"],
                **PRICING_INFO["tavily"],
            },
            "nano_banana": {
                "total_attempted": data["nano_banana"]["total_attempted"],
                "total_succeeded": data["nano_banana"]["total_succeeded"],
                "total_failed": data["nano_banana"]["total_attempted"] - data["nano_banana"]["total_succeeded"],
                "estimated_cost_usd": costs["nano_banana_usd"],
                **PRICING_INFO["nano_banana"],
            },
        },
    }


@router.delete("/usage/reset")
async def reset_usage():
    """Reset all usage counters to zero (persists to Supabase Storage)."""
    try:
        from backend.utils.usage_tracker import reset_usage as _reset
        _reset()
    except Exception as e:
        return {"message": f"Reset failed: {e}"}
    return {"message": "Usage counters reset to zero"}
