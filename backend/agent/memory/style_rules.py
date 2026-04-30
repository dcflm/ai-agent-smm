"""
Style rules management - learns from employee edits and stores rules
that are injected into the agent's system prompt.
"""
from supabase import create_client
from backend.config import get_settings
import anthropic


async def extract_style_rule(original_text: str, edited_text: str) -> str:
    """Use Claude to extract a concise style rule from an edit."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = f"""An employee edited an AI-generated LinkedIn post. Extract a concise style rule (1-2 sentences) from the difference.

ORIGINAL:
{original_text}

EDITED:
{edited_text}

Write only the rule, e.g. "Always end posts with a question to encourage engagement." or "Use shorter sentences and avoid corporate jargon." No preamble."""

    message = client.messages.create(
        model=settings.claude_model,
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        from backend.utils.usage_tracker import track_anthropic
        track_anthropic("style_rule", message.usage.input_tokens, message.usage.output_tokens)
    except Exception:
        pass
    return message.content[0].text.strip()


async def save_style_rule(rule_text: str, source_post_id: str | None = None) -> None:
    """Persist a style rule to the database."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    supabase.table("style_rules").insert({
        "rule_text": rule_text,
        "source_post_id": source_post_id,
    }).execute()


async def get_recent_style_rules(limit: int | None = None) -> list[str]:
    """Fetch the most recent style rules for injection into prompts."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return []
    n = limit or settings.style_rules_limit
    try:
        supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
        result = (
            supabase.table("style_rules")
            .select("rule_text")
            .order("created_at", desc=True)
            .limit(n)
            .execute()
        )
        return [r["rule_text"] for r in (result.data or [])]
    except Exception:
        return []
