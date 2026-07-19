"""
Email notifications via the Resend HTTP API (uses httpx, no extra dependency).

Sends a "posts ready for review" summary after a scheduled generation run.
Fails soft: if the API key is missing or the request errors, it logs and
returns False so the generation pipeline is never broken by email problems.
"""
import html

import httpx

from backend.config import get_settings

RESEND_ENDPOINT = "https://api.resend.com/emails"


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
    """Low-level Resend POST. Returns (ok, human-readable detail, resend_email_id)."""
    settings = get_settings()
    to = (to or "").strip()

    if not settings.resend_api_key:
        return False, "No RESEND_API_KEY configured on the server.", ""
    if not to:
        return False, "No recipient email address.", ""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={"from": settings.email_from, "to": [to], "subject": subject, "html": body_html},
            )
        if resp.status_code in (200, 201):
            try:
                resend_id = resp.json().get("id", "")
            except Exception:
                resend_id = ""
            return True, f"Email sent to {to}.", resend_id
        # Turn Resend's raw error into a clear, actionable message
        try:
            body = resp.json()
            raw_msg = body.get("message", "") or resp.text
        except Exception:
            raw_msg = resp.text
        if resp.status_code == 403 and "verify a domain" in raw_msg.lower():
            detail = (
                f"Can't send to {to} yet: with the current sender ({settings.email_from}) Resend only "
                "delivers to your own Resend account address. Verify a domain at resend.com/domains and set "
                "EMAIL_FROM to an address on it (e.g. noreply@yourdomain.com) to email any recipient."
            )
        elif resp.status_code in (401, 403) and "api key" in raw_msg.lower():
            detail = "The RESEND_API_KEY was rejected — generate a new key at resend.com."
        else:
            detail = f"Resend error (HTTP {resp.status_code}): {raw_msg[:200]}"
        return False, detail, ""
    except Exception as e:
        return False, f"Request error: {e!r}", ""


async def _check_delivery(resend_id: str, to: str) -> None:
    """~40s after a send, ask Resend what actually happened to the message
    (last_event: delivered / bounced / complained / …) and record it.
    Best-effort — never raises."""
    import asyncio
    from backend.utils.email_log import record_email_event
    if not resend_id:
        return
    try:
        await asyncio.sleep(40)
        settings = get_settings()
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{RESEND_ENDPOINT}/{resend_id}",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
        if r.status_code == 200:
            last_event = r.json().get("last_event", "unknown")
            print(f"[email] Delivery status for {resend_id}: {last_event}")
            await asyncio.to_thread(
                record_email_event, "delivery", f"Resend delivery status: {last_event}", to, resend_id,
            )
        else:
            print(f"[email] Delivery check HTTP {r.status_code} for {resend_id}")
    except Exception as e:
        print(f"[email] Delivery check failed: {e!r}")


async def send_review_email(to: str, count: int, titles: list[str]) -> bool:
    """Send a review digest email ("N posts waiting for review"). Returns True on success."""
    import asyncio
    if count <= 0:
        print("[email] Skipped — no new posts")
        return False
    company = get_settings().company_name
    subject = f"🟢 {count} new post{'s' if count != 1 else ''} ready for review — {company}"
    ok, detail, resend_id = await _send(to, subject, _build_html(count, titles))
    print(f"[email] {'Sent' if ok else 'Failed'} — {detail}")
    try:
        from backend.utils.email_log import record_email_event
        await asyncio.to_thread(record_email_event, "sent" if ok else "failed", detail, to, resend_id)
    except Exception:
        pass
    if ok:
        asyncio.create_task(_check_delivery(resend_id, to))
    return ok


async def send_test_email(to: str) -> tuple[bool, str]:
    """Send a one-off test email so the operator can verify delivery. Returns (ok, detail)."""
    import asyncio
    company = get_settings().company_name
    subject = f"✅ Test email — {company} notifications are working"
    body = _build_html(1, ["This is a test — your review notifications are set up correctly."])
    ok, detail, resend_id = await _send(to, subject, body)
    print(f"[email] Test {'sent' if ok else 'failed'} — {detail}")
    if ok:
        asyncio.create_task(_check_delivery(resend_id, to))
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
