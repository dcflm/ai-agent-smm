import requests
from backend.config import get_settings


def _headers() -> dict:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.linkedin_access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }


def post_to_linkedin(text: str, image_url: str | None = None) -> str:
    """
    Post content to the LinkedIn company page.
    Returns the LinkedIn post URN.
    """
    settings = get_settings()
    org_urn = f"urn:li:organization:{settings.linkedin_organization_id}"

    # If there's an image hosted publicly, attach it
    # For prototype: we post text-only if image is a local path
    content: dict = {
        "author": org_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

    if image_url and image_url.startswith("http"):
        content["specificContent"]["com.linkedin.ugc.ShareContent"]["shareMediaCategory"] = "IMAGE"
        content["specificContent"]["com.linkedin.ugc.ShareContent"]["media"] = [
            {
                "status": "READY",
                "description": {"text": ""},
                "media": image_url,
                "title": {"text": ""},
            }
        ]

    response = requests.post(
        "https://api.linkedin.com/v2/ugcPosts",
        headers=_headers(),
        json=content,
        timeout=30,
    )
    response.raise_for_status()
    post_id = response.headers.get("x-restli-id", response.json().get("id", ""))
    return post_id


def fetch_post_kpis(linkedin_post_id: str) -> dict:
    """
    Fetch engagement statistics for a published post.
    Returns dict with impressions, reactions, comments, shares, clicks.
    """
    settings = get_settings()
    org_urn = f"urn:li:organization:{settings.linkedin_organization_id}"
    encoded_post_urn = requests.utils.quote(linkedin_post_id, safe="")

    url = (
        "https://api.linkedin.com/v2/organizationalEntityShareStatistics"
        f"?q=organizationalEntity&organizationalEntity={requests.utils.quote(org_urn, safe='')}"
        f"&shares[0]={encoded_post_urn}"
    )

    response = requests.get(url, headers=_headers(), timeout=30)
    response.raise_for_status()
    data = response.json()

    elements = data.get("elements", [])
    if not elements:
        return {"impressions": 0, "reactions": 0, "comments": 0, "shares": 0, "clicks": 0}

    stats = elements[0].get("totalShareStatistics", {})
    impressions = stats.get("impressionCount", 0)
    reactions = stats.get("likeCount", 0)
    comments = stats.get("commentCount", 0)
    shares = stats.get("shareCount", 0)
    clicks = stats.get("clickCount", 0)
    total_interactions = reactions + comments + shares + clicks
    engagement_rate = (total_interactions / impressions * 100) if impressions > 0 else 0.0

    return {
        "impressions": impressions,
        "reactions": reactions,
        "comments": comments,
        "shares": shares,
        "clicks": clicks,
        "engagement_rate": round(engagement_rate, 2),
    }
