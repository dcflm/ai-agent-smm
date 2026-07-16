"""
LinkedIn connection status endpoint.
Lets the web app show whether direct publishing is configured/working,
without exposing the access token.
"""
from fastapi import APIRouter
import httpx

from backend.config import get_settings

router = APIRouter(prefix="/linkedin", tags=["linkedin"])


@router.get("/status")
async def linkedin_status():
    """Report whether LinkedIn publishing is configured, and validate the token if present."""
    settings = get_settings()
    token = (settings.linkedin_access_token or "").strip()
    org_id = (settings.linkedin_organization_id or "").strip()

    configured = bool(token and org_id and token not in ("your-long-lived-access-token",))
    if not configured:
        return {
            "configured": False,
            "connected": False,
            "detail": "LinkedIn is not connected. Add LINKEDIN_ACCESS_TOKEN and "
                      "LINKEDIN_ORGANIZATION_ID to enable direct publishing (see LINKEDIN_SETUP.md).",
            "organization_id": org_id or None,
        }

    # Configured — validate the token with a lightweight authenticated call.
    try:
        import urllib.parse
        org_urn = f"urn:li:organization:{org_id}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.linkedin.com/v2/networkSizes/{urllib.parse.quote(org_urn, safe='')}",
                params={"edgeType": "CompanyFollowedByMember"},
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            return {"configured": True, "connected": True,
                    "detail": "Connected — direct publishing is active.",
                    "organization_id": org_id}
        if resp.status_code in (401, 403):
            return {"configured": True, "connected": False,
                    "detail": "Token is set but rejected by LinkedIn (expired or missing "
                              "w_organization_social scope). Regenerate it — see LINKEDIN_SETUP.md.",
                    "organization_id": org_id}
        return {"configured": True, "connected": False,
                "detail": f"LinkedIn returned HTTP {resp.status_code}. Publishing may not work yet.",
                "organization_id": org_id}
    except Exception as e:
        return {"configured": True, "connected": False,
                "detail": f"Could not reach LinkedIn to validate the token: {str(e)[:120]}",
                "organization_id": org_id}
