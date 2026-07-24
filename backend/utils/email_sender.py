"""
Email notifications via the Brevo (Sendinblue) transactional HTTP API
(uses httpx, no extra dependency).

Brevo is used because it allows sending to ANY recipient after a one-time,
no-DNS sender verification (the operator clicks a link Brevo emails to the
`EMAIL_FROM` address). End users just type their address.

Sends a "posts ready for review" summary after a scheduled generation run.
Fails soft: if the key/sender is missing or the request errors, it logs and
returns False so the generation pipeline is never broken by email problems.
"""
import html

import httpx

from backend.config import get_settings

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"


def _app_url() -> str:
    """First origin from FRONTEND_URL (may be comma-separated), no trailing slash."""
    settings = get_settings()
    raw = (settings.frontend_url or "http://localhost:3000").split(",")[0].strip()
    return raw.rstrip("/")


def _build_html(count: int, titles: list[str]) -> str:
    app = _app_url()
    company = html.escape(get_settings().company_name)
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
    Your AI social media manager just generated {'these drafts' if count != 1 else 'a draft'} for {company}.
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


async def _send(to: str, subject: str, body_html: str) -> tuple[bool, str, str]:
    """Low-level Brevo POST. Returns (ok, human-readable detail, message_id)."""
    settings = get_settings()
    to = (to or "").strip()

    # Platform not configured / no recipient: user-facing text stays neutral;
    # the operator sees the real reason in the server log.
    if not settings.brevo_api_key or not settings.email_from:
        missing = "BREVO_API_KEY" if not settings.brevo_api_key else "EMAIL_FROM (verified sender)"
        print(f"[email] Not configured — {missing} is unset on the server.")
        return False, "Email notifications aren't set up yet.", ""
    if not to:
        return False, "No email address entered.", ""

    sender_name = settings.email_from_name or settings.company_name or "Notifications"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                BREVO_ENDPOINT,
                headers={
                    "api-key": settings.brevo_api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json={
                    "sender": {"name": sender_name, "email": settings.email_from},
                    "to": [{"email": to}],
                    "subject": subject,
                    "htmlContent": body_html,
                },
            )
        if resp.status_code in (200, 201):
            try:
                msg_id = resp.json().get("messageId", "")
            except Exception:
                msg_id = ""
            return True, f"Email sent to {to}.", str(msg_id)
        # Log the raw provider reason for the operator; return a plain,
        # provider-agnostic message for anything a user can see.
        try:
            raw_msg = resp.json().get("message", "") or resp.text
        except Exception:
            raw_msg = resp.text
        print(f"[email] Provider error HTTP {resp.status_code}: {raw_msg[:300]}")
        low = raw_msg.lower()
        if resp.status_code in (401, 403) or "unauthorized" in low or "api" in low and "key" in low:
            user_detail = "Email notifications aren't set up yet."
        elif "sender" in low or "not verified" in low or "not been activated" in low:
            # Sender not verified/activated in Brevo — operator-side setup gap
            user_detail = "Email notifications are still being set up — please try again shortly."
        elif "invalid" in low and ("email" in low or "recipient" in low or "to" in low):
            user_detail = "That email address looks invalid — please double-check it."
        else:
            user_detail = "Couldn't send the email right now. Please try again in a moment."
        return False, user_detail, ""
    except Exception as e:
        print(f"[email] Send request error: {e!r}")
        return False, "Couldn't send the email right now. Please try again in a moment.", ""


async def send_review_email(to: str, count: int, titles: list[str]) -> bool:
    """Send a review email ("N posts ready for review"). Returns True on success."""
    import asyncio
    if count <= 0:
        print("[email] Skipped — no new posts")
        return False
    company = get_settings().company_name
    subject = f"🟢 {count} new post{'s' if count != 1 else ''} ready for review — {company}"
    ok, detail, msg_id = await _send(to, subject, _build_html(count, titles))
    print(f"[email] {'Sent' if ok else 'Failed'} — {detail}")
    try:
        from backend.utils.email_log import record_email_event
        await asyncio.to_thread(record_email_event, "sent" if ok else "failed", detail, to, msg_id)
    except Exception:
        pass
    return ok


async def send_test_email(to: str) -> tuple[bool, str]:
    """Send a one-off test email so the operator can verify delivery. Returns (ok, detail)."""
    company = get_settings().company_name
    subject = f"✅ Test email — {company} notifications are working"
    body = _build_html(1, ["This is a test — your review notifications are set up correctly."])
    ok, detail, _ = await _send(to, subject, body)
    print(f"[email] Test {'sent' if ok else 'failed'} — {detail}")
    return ok, detail


async def send_linkedin_alert_email(to: str, detail: str) -> bool:
    """Alert the admin that the LinkedIn token stopped working (expired/revoked)."""
    app = _app_url()
    company = get_settings().company_name
    subject = f"⚠️ LinkedIn connection needs attention — {company}"
    body = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
  <h2 style="color:#0f172a;font-size:20px;margin:0 0 8px;">LinkedIn publishing stopped working</h2>
  <p style="color:#475569;font-size:14px;margin:0 0 12px;">
    The saved LinkedIn access token was rejected — it has likely expired (tokens last ~60 days) or was revoked.
    Until it's renewed, approved posts are saved as “approved” but are <strong>not</strong> published to LinkedIn.
  </p>
  <p style="color:#64748b;font-size:13px;margin:0 0 16px;">Details: {html.escape(detail[:200])}</p>
  <a href="{app}/linkedin"
     style="display:inline-block;background:#0A66C2;color:#ffffff;text-decoration:none;
            font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px;">
    Renew the connection →
  </a>
</div>"""
    ok, send_detail, _ = await _send(to, subject, body)
    print(f"[email] LinkedIn alert {'sent' if ok else 'failed'} — {send_detail}")
    return ok
