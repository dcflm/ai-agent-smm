from fastapi import APIRouter, HTTPException
from backend.db import get_supabase
from backend.agent.tools.linkedin_tool import fetch_post_kpis
from backend.config import get_settings
from datetime import datetime, timezone, timedelta
import httpx

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/refresh/{post_id}")
async def refresh_kpis(post_id: str):
    """Manually trigger a KPI refresh for a specific post."""
    try:
        db = get_supabase()
        post_res = db.table("posts").select("linkedin_post_id").eq("id", post_id).execute()
        if not post_res.data:
            raise HTTPException(status_code=404, detail="Post not found")
        linkedin_post_id = post_res.data[0].get("linkedin_post_id")
        if not linkedin_post_id:
            raise HTTPException(status_code=400, detail="Post not published to LinkedIn yet")

        kpi_data = fetch_post_kpis(linkedin_post_id)
        db.table("post_kpis").insert({"post_id": post_id, **kpi_data}).execute()
        return kpi_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:120])


@router.get("/overview")
async def get_overview():
    """Get aggregate KPI overview for the dashboard."""
    try:
        db = get_supabase()

        posts_res = db.table("posts").select("id, status, published_at").execute()
        posts = posts_res.data or []

        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        total_published = sum(1 for p in posts if p.get("status") == "published")
        recent_posts = sum(1 for p in posts if p.get("status") == "published" and p.get("published_at", "") >= since)

        kpis_res = db.table("post_kpis").select("impressions, reactions, comments, shares, engagement_rate").execute()
        kpis = kpis_res.data or []

        total_impressions = sum(k.get("impressions", 0) for k in kpis)
        total_reactions = sum(k.get("reactions", 0) for k in kpis)
        total_comments = sum(k.get("comments", 0) for k in kpis)
        total_shares = sum(k.get("shares", 0) for k in kpis)
        avg_engagement = round(sum(k.get("engagement_rate", 0) for k in kpis) / len(kpis), 2) if kpis else 0.0

        return {
            "total_published": total_published,
            "recent_posts_30d": recent_posts,
            "total_impressions": total_impressions,
            "total_reactions": total_reactions,
            "total_comments": total_comments,
            "total_shares": total_shares,
            "avg_engagement_rate": avg_engagement,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])


@router.get("/posts")
async def get_posts_with_kpis(limit: int = 20):
    """Get published posts with their latest KPI snapshot."""
    try:
        db = get_supabase()
        posts_res = db.table("posts").select("id, text, news_title, published_at").eq("status", "published").order("published_at", desc=True).limit(limit).execute()
        posts = posts_res.data or []

        output = []
        for post in posts:
            kpi_res = db.table("post_kpis").select("*").eq("post_id", post["id"]).order("fetched_at", desc=True).limit(1).execute()
            kpi = kpi_res.data[0] if kpi_res.data else {}
            output.append({
                "id": post["id"],
                "text": post["text"][:100] + "..." if len(post.get("text", "")) > 100 else post.get("text", ""),
                "news_title": post.get("news_title"),
                "published_at": post.get("published_at"),
                "kpi": {
                    "impressions": kpi.get("impressions", 0),
                    "reactions": kpi.get("reactions", 0),
                    "comments": kpi.get("comments", 0),
                    "shares": kpi.get("shares", 0),
                    "engagement_rate": kpi.get("engagement_rate", 0.0),
                    "fetched_at": kpi.get("fetched_at"),
                },
            })
        return output
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:120])


@router.get("/company-stats")
async def get_company_stats():
    """DB stats + LinkedIn follower count (when API is configured)."""
    try:
        db = get_supabase()
        posts_res = db.table("posts").select("id, status, created_at").execute()
        posts = [p for p in (posts_res.data or []) if p.get("text") != "__generating__"]

        this_month = datetime.now(timezone.utc).strftime("%Y-%m")
        total_generated = len(posts)
        pending_review = sum(1 for p in posts if p.get("status") == "pending_review")
        published = sum(1 for p in posts if p.get("status") in ("published", "approved"))
        generated_this_month = sum(1 for p in posts if (p.get("created_at") or "")[:7] == this_month)

        followers: int | None = None
        settings = get_settings()
        token = settings.linkedin_access_token or ""
        org_id = settings.linkedin_organization_id or ""

        if token and token not in ("your-long-lived-access-token", ""):
            try:
                import urllib.parse
                org_urn = f"urn:li:organization:{org_id}"
                async with httpx.AsyncClient(timeout=8) as client:
                    resp = await client.get(
                        f"https://api.linkedin.com/v2/networkSizes/{urllib.parse.quote(org_urn, safe='')}",
                        params={"edgeType": "CompanyFollowedByMember"},
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if resp.status_code == 200:
                        followers = resp.json().get("firstDegreeSize")
            except Exception as e:
                print(f"LinkedIn followers fetch failed: {e}")

        return {
            "followers": followers,
            "total_generated": total_generated,
            "pending_review": pending_review,
            "published": published,
            "generated_this_month": generated_this_month,
            "linkedin_connected": bool(token and token not in ("your-long-lived-access-token", "")),
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])


@router.get("/timeseries")
async def get_timeseries(days: int = 30):
    """Get daily KPI timeseries for charts."""
    try:
        db = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        res = db.table("post_kpis").select("fetched_at, impressions, reactions, engagement_rate").gte("fetched_at", since).order("fetched_at").execute()
        rows = res.data or []

        # Group by date
        by_date: dict = {}
        for r in rows:
            date = r.get("fetched_at", "")[:10]
            if date not in by_date:
                by_date[date] = {"impressions": 0, "reactions": 0, "engagement_rates": []}
            by_date[date]["impressions"] += r.get("impressions", 0)
            by_date[date]["reactions"] += r.get("reactions", 0)
            by_date[date]["engagement_rates"].append(r.get("engagement_rate", 0))

        return [
            {
                "date": date,
                "impressions": v["impressions"],
                "reactions": v["reactions"],
                "engagement_rate": round(sum(v["engagement_rates"]) / len(v["engagement_rates"]), 2) if v["engagement_rates"] else 0.0,
            }
            for date, v in sorted(by_date.items())
        ]
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:120])
