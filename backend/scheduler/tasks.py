from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timezone, timedelta
import asyncio
import logging
import os
import uuid

import httpx

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
    # Render free tier spins down after 15 min without inbound requests.
    # Pinging our own public URL counts as inbound traffic and keeps us awake.
    # RENDER_EXTERNAL_URL is set automatically by Render, so this never runs locally.
    if os.environ.get("RENDER_EXTERNAL_URL"):
        scheduler.add_job(
            keep_alive_ping, IntervalTrigger(minutes=10),
            id="keep_alive", replace_existing=True,
            misfire_grace_time=120, coalesce=True,
        )
    scheduler.start()
    logger.info("Scheduler started")
    return scheduler


async def run_news_pipeline(num_posts: int = 2):
    """Scheduled/triggered generation of `num_posts` review-ready posts.

    Each post gets a '__generating__' placeholder first (so the Content page
    shows the loading animation), then is filled in. Notion is best-effort and
    never blocks: a post reaches 'pending_review' regardless of Notion. An
    email summary is sent at the end if a notification address is configured.
    """
    print(f"[pipeline] Running news pipeline ({num_posts} posts) at {datetime.now()}")
    try:
        from backend.agent.tools.news_search import SEARCH_QUERIES
        from backend.agent.core import generate_post_for_news
        from backend.db import get_supabase

        db = get_supabase()
        created_titles: list[str] = []

        for query in SEARCH_QUERIES[:num_posts]:
            post_id = str(uuid.uuid4())
            # 1. Placeholder → drives the loading skeleton on the Content page
            try:
                db.table("posts").insert({
                    "id": post_id,
                    "text": "__generating__",
                    "status": "draft",
                    "news_title": "Generating new post…",
                }).execute()
            except Exception as e:
                print(f"[pipeline] Placeholder insert failed: {e!r}")
                continue

            # 2. Generate
            try:
                result = await generate_post_for_news(news_query=query)
                if not result.get("post_text"):
                    db.table("posts").delete().eq("id", post_id).execute()
                    print(f"[pipeline] No text for query '{query}', placeholder removed")
                    continue

                db.table("posts").update({
                    "text": result["post_text"],
                    "image_url": result.get("image_path"),
                    "news_source": result.get("news_url"),
                    "news_title": result.get("news_title"),
                    "status": "pending_review",
                }).eq("id", post_id).execute()
                created_titles.append(result.get("news_title") or "New post")
                print(f"[pipeline] Created post {post_id}")

                # 3. Notion mirror — best-effort, never blocks the post
                try:
                    from backend.agent.tools.notion_tool import create_post_page
                    notion_id = await asyncio.wait_for(create_post_page(
                        post_id=post_id,
                        text=result["post_text"],
                        image_url=result.get("image_path"),
                        news_title=result.get("news_title"),
                        news_source=result.get("news_url"),
                    ), timeout=15.0)
                    db.table("posts").update({"notion_page_id": notion_id}).eq("id", post_id).execute()
                except Exception as e:
                    print(f"[pipeline] Notion mirror skipped: {e!r}")

            except Exception as e:
                print(f"[pipeline] Generation error for '{query}': {e!r}")
                db.table("posts").delete().eq("id", post_id).execute()

        # 4. Email the reviewer if notifications are enabled and posts were created
        print(f"[pipeline] Done — {len(created_titles)} post(s) created")
        if created_titles:
            try:
                from backend.api.schedule import load_settings
                from backend.utils.email_sender import send_review_email
                notify_email = (load_settings().get("notify_email") or "").strip()
                if notify_email:
                    await send_review_email(notify_email, len(created_titles), created_titles)
            except Exception as e:
                print(f"[pipeline] Review email step failed: {e!r}")
    except Exception as e:
        print(f"[pipeline] News pipeline failed: {e!r}")


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


async def keep_alive_ping():
    url = os.environ.get("RENDER_EXTERNAL_URL")
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.get(f"{url}/health")
    except Exception as e:
        logger.warning(f"Keep-alive ping failed: {e}")


async def poll_notion_approvals():
    logger.info(f"[{datetime.now()}] Polling Notion")
    try:
        from backend.api.webhooks import _process_notion_updates
        await asyncio.wait_for(_process_notion_updates(), timeout=25.0)
    except asyncio.TimeoutError:
        logger.warning("Notion poll timed out after 25s — skipping this cycle")
    except Exception as e:
        logger.error(f"Notion polling failed: {e}")
