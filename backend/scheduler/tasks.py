from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timezone, timedelta
import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def setup_scheduler(app=None):
    # Note: auto-post jobs are controlled via /api/schedule/settings (schedule_settings.json)
    # Do NOT add a hardcoded daily_news_pipeline here - it would always run regardless of settings
    scheduler.add_job(
        refresh_linkedin_kpis, IntervalTrigger(hours=6),
        id="kpi_refresh", replace_existing=True,
        misfire_grace_time=1800, coalesce=True,
    )
    scheduler.add_job(
        poll_notion_approvals, IntervalTrigger(seconds=30),
        id="notion_poll", replace_existing=True,
        misfire_grace_time=60, coalesce=True,
    )
    scheduler.start()
    logger.info("Scheduler started")
    return scheduler


async def run_news_pipeline():
    logger.info(f"[{datetime.now()}] Running daily news pipeline")
    try:
        from backend.agent.tools.news_search import SEARCH_QUERIES
        from backend.agent.core import generate_post_for_news
        from backend.agent.tools.notion_tool import create_post_page
        from backend.db import get_supabase

        db = get_supabase()
        for query in SEARCH_QUERIES[:2]:
            try:
                result = await generate_post_for_news(news_query=query)
                if not result["post_text"]:
                    continue

                post_id = str(uuid.uuid4())
                db.table("posts").insert({
                    "id": post_id,
                    "text": result["post_text"],
                    "image_url": result.get("image_path"),
                    "news_source": result.get("news_url"),
                    "news_title": result.get("news_title"),
                    "status": "draft",
                }).execute()

                notion_id = await create_post_page(
                    post_id=post_id,
                    text=result["post_text"],
                    image_url=result.get("image_path"),
                    news_title=result.get("news_title"),
                    news_source=result.get("news_url"),
                )
                db.table("posts").update({
                    "notion_page_id": notion_id,
                    "status": "pending_review",
                }).eq("id", post_id).execute()

                logger.info(f"Created post {post_id}")
            except Exception as e:
                logger.error(f"Error for query '{query}': {e}")
    except Exception as e:
        logger.error(f"News pipeline failed: {e}")


async def refresh_linkedin_kpis():
    logger.info(f"[{datetime.now()}] Refreshing LinkedIn KPIs")
    try:
        from backend.agent.tools.linkedin_tool import fetch_post_kpis
        from backend.db import get_supabase

        db = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        res = db.table("posts").select("id, linkedin_post_id").eq("status", "published").gte("published_at", since).execute()

        for post in (res.data or []):
            if not post.get("linkedin_post_id"):
                continue
            try:
                kpi_data = fetch_post_kpis(post["linkedin_post_id"])
                db.table("post_kpis").insert({"post_id": post["id"], **kpi_data}).execute()
            except Exception as e:
                logger.error(f"KPI fetch error for post {post['id']}: {e}")
    except Exception as e:
        logger.error(f"KPI refresh failed: {e}")


async def poll_notion_approvals():
    logger.info(f"[{datetime.now()}] Polling Notion")
    try:
        from backend.api.webhooks import _process_notion_updates
        await asyncio.wait_for(_process_notion_updates(), timeout=25.0)
    except asyncio.TimeoutError:
        logger.warning("Notion poll timed out after 25s — skipping this cycle")
    except Exception as e:
        logger.error(f"Notion polling failed: {e}")
