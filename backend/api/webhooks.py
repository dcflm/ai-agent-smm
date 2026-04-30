from fastapi import APIRouter, BackgroundTasks
from datetime import datetime, timezone

from backend.db import get_supabase
from backend.agent.tools.notion_tool import (
    get_client as get_notion_client,
    extract_feedback_from_page,
    create_post_page,
    update_page_status,
)
from backend.agent.tools.linkedin_tool import post_to_linkedin
from backend.agent.core import generate_post_for_news
from backend.agent.memory.rag import store_post_embedding
from backend.agent.memory.style_rules import extract_style_rule, save_style_rule

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Notion status name → internal status
NOTION_TO_STATUS = {
    "Approved": "approved",
    "Rejected": "rejected",
    "Changes Requested": "changes_requested",
    "Pending Review": "pending_review",
}


@router.post("/notion/poll")
async def poll_notion(background_tasks: BackgroundTasks):
    background_tasks.add_task(_process_notion_updates)
    return {"message": "Polling Notion for updates"}


async def _process_notion_updates():
    """
    Bidirectional Notion sync:
    - Fetch all DB posts that have a notion_page_id and are actionable
    - For each, fetch current Notion status
    - If Notion status differs from DB → act (approve/reject/revise)
    """
    db = get_supabase()
    try:
        # Get all posts with a Notion page that are still in review
        res = db.table("posts").select("*").in_(
            "status", ["pending_review", "changes_requested", "draft"]
        ).not_.is_("notion_page_id", "null").execute()
        posts = res.data or []
    except Exception as e:
        print(f"Notion poll DB query error: {e}")
        return

    if not posts:
        return

    notion = get_notion_client()

    for post in posts:
        notion_page_id = post.get("notion_page_id")
        if not notion_page_id:
            continue
        try:
            page = await notion.pages.retrieve(page_id=notion_page_id)

            # Notion delete = archived → delete from DB
            if page.get("archived"):
                print(f"Notion delete detected: removing post {post['id']} from DB")
                db.table("posts").delete().eq("id", post["id"]).execute()
                continue

            notion_status_name = (
                page.get("properties", {})
                .get("Status", {})
                .get("select", {})
                .get("name", "")
            )
            notion_status = NOTION_TO_STATUS.get(notion_status_name, "")
            db_status = post.get("status", "")

            # No change
            if notion_status == db_status or not notion_status:
                continue

            print(f"Notion sync: post {post['id']} {db_status} → {notion_status}")

            if notion_status == "approved" and db_status in ("pending_review", "draft", "changes_requested"):
                await _handle_approval(post, db)

            elif notion_status == "rejected":
                db.table("posts").update({"status": "rejected"}).eq("id", post["id"]).execute()

            elif notion_status == "changes_requested" and db_status in ("pending_review", "draft"):
                feedback = await extract_feedback_from_page(notion_page_id)
                if feedback:
                    await _handle_revision(post, feedback, db)

        except Exception as e:
            print(f"Notion sync error for post {post['id']}: {e}")


async def _handle_approval(post: dict, db):
    try:
        image_url = post.get("image_url")
        linkedin_id = post_to_linkedin(
            text=post["text"],
            image_url=image_url if image_url and image_url.startswith("http") else None,
        )
        now = datetime.now(timezone.utc).isoformat()
        db.table("posts").update({
            "linkedin_post_id": linkedin_id,
            "status": "published",
            "published_at": now,
        }).eq("id", post["id"]).execute()
        await store_post_embedding(
            post_id=post["id"],
            post_text=post["text"],
            metadata={"news_title": post.get("news_title"), "published_at": now},
        )
    except Exception as e:
        print(f"Approval/publish error for post {post['id']}: {e}")
        db.table("posts").update({"status": "approved"}).eq("id", post["id"]).execute()


async def _handle_revision(post: dict, feedback: str, db):
    try:
        original_text = post["text"]
        db.table("posts").update({"status": "changes_requested"}).eq("id", post["id"]).execute()

        result = await generate_post_for_news(
            revision_context=feedback,
            original_post_text=original_text,
        )
        if not result.get("post_text"):
            return

        updates = {"text": result["post_text"], "status": "pending_review"}
        if result.get("image_path"):
            updates["image_url"] = result["image_path"]

        try:
            new_notion_id = await create_post_page(
                post_id=post["id"],
                text=result["post_text"],
                image_url=result.get("image_path"),
                news_title=post.get("news_title"),
                news_source=post.get("news_source"),
            )
            updates["notion_page_id"] = new_notion_id
        except Exception as e:
            print(f"Notion page create failed: {e}")

        db.table("posts").update(updates).eq("id", post["id"]).execute()
        db.table("edit_history").insert({
            "post_id": post["id"],
            "original_text": original_text,
            "edited_text": result["post_text"],
            "diff_summary": feedback,
        }).execute()

        rule = await extract_style_rule(original_text, result["post_text"])
        await save_style_rule(rule, source_post_id=post["id"])

    except Exception as e:
        print(f"Revision error for post {post['id']}: {e}")
        db.table("posts").update({"status": "pending_review"}).eq("id", post["id"]).execute()
