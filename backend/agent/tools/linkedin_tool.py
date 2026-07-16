import requests
from backend.config import get_settings


def _headers() -> dict:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.linkedin_access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }


def _upload_image_asset(image_url: str, org_urn: str) -> str | None:
    """
    Register and upload an image to LinkedIn, returning the asset URN
    (e.g. 'urn:li:digitalmediaAsset:...') to attach to a post.

    LinkedIn does NOT accept a raw external image URL in a post — the image
    must be registered and its bytes uploaded first. This performs that flow:
      1. registerUpload  → get an uploadUrl + asset URN
      2. download the image bytes from image_url
      3. PUT the bytes to uploadUrl
    Returns None on any failure so the caller can fall back to a text-only post.
    """
    settings = get_settings()
    try:
        # 1. Register the upload
        register_body = {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": org_urn,
                "serviceRelationships": [
                    {"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}
                ],
            }
        }
        reg = requests.post(
            "https://api.linkedin.com/v2/assets?action=registerUpload",
            headers=_headers(),
            json=register_body,
            timeout=30,
        )
        reg.raise_for_status()
        reg_data = reg.json()["value"]
        asset_urn = reg_data["asset"]
        upload_url = (
            reg_data["uploadMechanism"]
            ["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
            ["uploadUrl"]
        )

        # 2. Download the image bytes
        img = requests.get(image_url, timeout=60)
        img.raise_for_status()

        # 3. Upload the bytes to LinkedIn (bearer auth, raw binary body)
        up = requests.put(
            upload_url,
            headers={"Authorization": f"Bearer {settings.linkedin_access_token}"},
            data=img.content,
            timeout=120,
        )
        up.raise_for_status()
        return asset_urn
    except Exception as e:
        print(f"[linkedin] Image upload failed, posting text-only: {e!r}")
        return None


def post_to_linkedin(text: str, image_url: str | None = None) -> str:
    """
    Post content to the LinkedIn company page via the UGC Posts API.
    Attaches an image when one is provided (uploaded as a registered asset).
    Returns the LinkedIn post URN.
    """
    settings = get_settings()
    org_urn = f"urn:li:organization:{settings.linkedin_organization_id}"

    share_content: dict = {
        "shareCommentary": {"text": text},
        "shareMediaCategory": "NONE",
    }

    # Upload + attach the image if we have a public URL for it
    if image_url and image_url.startswith("http"):
        asset_urn = _upload_image_asset(image_url, org_urn)
        if asset_urn:
            share_content["shareMediaCategory"] = "IMAGE"
            share_content["media"] = [
                {"status": "READY", "description": {"text": ""},
                 "media": asset_urn, "title": {"text": ""}}
            ]

    content = {
        "author": org_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

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
