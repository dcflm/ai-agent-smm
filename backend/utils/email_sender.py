"""
Email notifications via the Resend HTTP API (uses httpx, no extra dependency).

Sends a "posts ready for review" summary after a scheduled generation run.
Fails soft: if the API key is missing or the request errors, it logs and
returns False so the generation pipeline is never broken by email problems.
"""
import logging
import html

import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def _app_url() -> str:
    """First origin from FRONTEND_URL (may be comma-separated), no trailing slash."""
    settings = get_settings()
    raw = (settings.frontend_url or "http://localhost:3000").split(",")[0].strip()
    return raw.rstrip("/")


def _build_html(count: int, titles: list[str]) -> str:
    app = _app_url()
    items = "".join(
        f'<li style="margin:6px 0;color:#334155;font-size:14px;">{html.escape(t or "Untitled post")}</li>'
        for t in titles[:10]
    )
    more = f'<p style="color:#64748b;font-size:13px;">…and {count - 10} more.</p>' if count > 10 else ""
    return f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
  <h2 style="color:#0f172a;font-size:20px;margin:0 0 8px;">
    {count} new post{'s' if count != 1 else ''} ready for review
  </h2>
  <p style="color:#475569;font-size:14px;margin:0 0 16px;">
    Your AI social media manager just generated {'these drafts' if count != 1 else 'a draft'} for bizpando AG.
    Review, edit, approve, or reject {'them' if count != 1 else 'it'} in the app.
  </p>
  <ul style="padding-left:18px;margin:0 0 20px;">{items}</ul>
  {more}
  <a href="{app}/content"
     style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
            font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px;">
    Review in the app →
  </a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
    You're receiving this because email notifications are enabled on the Schedule page.
    Turn them off there anytime.
  </p>
</div>"""


async def send_review_email(to: str, count: int, titles: list[str]) -> bool:
    """Send a review-proposal summary email. Returns True on success."""
    settings = get_settings()
    to = (to or "").strip()

    if not settings.resend_api_key:
        logger.info("Email skipped (no RESEND_API_KEY configured)")
        return False
    if not to:
        logger.info("Email skipped (no recipient address)")
        return False
    if count <= 0:
        logger.info("Email skipped (no new posts)")
        return False

    subject = f"🟢 {count} new post{'s' if count != 1 else ''} ready for review — bizpando AG"
    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": _build_html(count, titles),
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code in (200, 201):
            logger.info(f"Review email sent to {to} ({count} posts)")
            return True
        logger.warning(f"Email send failed: HTTP {resp.status_code} — {resp.text[:200]}")
        return False
    except Exception as e:
        logger.warning(f"Email send error: {e!r}")
        return False
