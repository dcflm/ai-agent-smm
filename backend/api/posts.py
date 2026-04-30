from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from backend.db import get_supabase
from backend.agent.core import generate_post_for_news
from backend.agent.memory.rag import store_post_embedding
from backend.agent.memory.style_rules import extract_style_rule, save_style_rule

router = APIRouter(prefix="/posts", tags=["posts"])


class ReviseRequest(BaseModel):
    feedback: str


class GeneratePostRequest(BaseModel):
    topic: str | None = None
    generate_image: bool = True


class PostResponse(BaseModel):
    id: str
    text: str
    image_url: str | None
    news_source: str | None
    news_title: str | None
    status: str
    notion_page_id: str | None
    linkedin_post_id: str | None
    created_at: str
    published_at: str | None


@router.post("/generate", status_code=202)
async def generate_post(request: GeneratePostRequest, background_tasks: BackgroundTasks):
    """Trigger the agent to generate a new LinkedIn post.
    Immediately creates a 'generating' placeholder in DB so UI can show loading."""
    db = get_supabase()
    post_id = str(uuid.uuid4())

    db.table("posts").insert({
        "id": post_id,
        "text": "__generating__",
        "status": "draft",
        "news_title": request.topic or "Generating new post…",
    }).execute()

    background_tasks.add_task(_run_generation_pipeline, post_id, request.topic, request.generate_image)
    return {"message": "Post generation started", "post_id": post_id}


async def _run_generation_pipeline(post_id: str, topic: str | None, generate_image: bool = True):
    """Background task: run agent, update placeholder."""
    db = get_supabase()
    try:
        result = await generate_post_for_news(news_query=topic, generate_image=generate_image)
        if not result["post_text"]:
            db.table("posts").delete().eq("id", post_id).execute()
            return

        db.table("posts").update({
            "text": result["post_text"],
            "image_url": result.get("image_path"),
            "news_source": result.get("news_url"),
            "news_title": result.get("news_title"),
            "status": "pending_review",
        }).eq("id", post_id).execute()

    except Exception as e:
        print(f"Generation pipeline error: {e}")
        db.table("posts").delete().eq("id", post_id).execute()


@router.get("/", response_model=list[PostResponse])
async def list_posts(status: str | None = None, limit: int = 50):
    """List all posts, optionally filtered by status."""
    try:
        db = get_supabase()
        query = db.table("posts").select("*").order("created_at", desc=True).limit(limit)
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return [_to_response(p) for p in (result.data or [])]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {str(e)[:120]}")


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(post_id: str):
    try:
        db = get_supabase()
        result = db.table("posts").select("*").eq("id", post_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Post not found")
        return _to_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:120])


@router.delete("/{post_id}")
async def delete_post(post_id: str):
    """Permanently delete a post."""
    db = get_supabase()
    res = db.table("posts").select("id").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Post not found")
    db.table("posts").delete().eq("id", post_id).execute()
    return {"message": "Post deleted"}


@router.get("/{post_id}/edits")
async def get_post_edits(post_id: str):
    try:
        db = get_supabase()
        result = db.table("edit_history").select("*").eq("post_id", post_id).order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:120])


@router.post("/{post_id}/approve", status_code=202)
async def approve_post(post_id: str, background_tasks: BackgroundTasks):
    """Approve a post - publishes to LinkedIn (if configured)."""
    db = get_supabase()
    res = db.table("posts").select("*").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Post not found")
    post = res.data[0]
    if post["status"] not in ("pending_review", "changes_requested", "draft"):
        raise HTTPException(status_code=400, detail=f"Cannot approve post with status '{post['status']}'")

    background_tasks.add_task(_run_approval, post)
    return {"message": "Approval started"}


@router.post("/{post_id}/reject")
async def reject_post(post_id: str):
    """Reject a post."""
    db = get_supabase()
    res = db.table("posts").select("id").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Post not found")
    db.table("posts").update({"status": "rejected"}).eq("id", post_id).execute()
    return {"message": "Post rejected"}


@router.post("/{post_id}/reopen")
async def reopen_post(post_id: str):
    """Move a rejected or approved post back to pending_review."""
    db = get_supabase()
    res = db.table("posts").select("id, status").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Post not found")
    post = res.data[0]
    if post["status"] not in ("rejected", "approved", "published", "changes_requested"):
        raise HTTPException(status_code=400, detail=f"Cannot reopen post with status '{post['status']}'")
    db.table("posts").update({"status": "pending_review"}).eq("id", post_id).execute()
    return {"message": "Post reopened"}


@router.post("/{post_id}/revise", status_code=202)
async def revise_post(post_id: str, body: ReviseRequest, background_tasks: BackgroundTasks):
    """Submit feedback and let the agent regenerate the post."""
    if not body.feedback.strip():
        raise HTTPException(status_code=400, detail="Feedback cannot be empty")
    db = get_supabase()
    res = db.table("posts").select("*").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Post not found")
    post = res.data[0]
    db.table("posts").update({"status": "changes_requested"}).eq("id", post_id).execute()
    background_tasks.add_task(_run_revision, post, body.feedback)
    return {"message": "Revision started"}


async def _run_approval(post: dict):
    """Background: try LinkedIn publish, then mark published/approved."""
    db = get_supabase()
    try:
        from backend.agent.tools.linkedin_tool import post_to_linkedin
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
        print(f"LinkedIn publish skipped ({e}), marking approved")
        db.table("posts").update({"status": "approved"}).eq("id", post["id"]).execute()


async def _run_revision(post: dict, feedback: str):
    """Background: regenerate post with agent using employee feedback."""
    db = get_supabase()
    original_text = post["text"]
    try:
        result = await generate_post_for_news(
            revision_context=feedback,
            original_post_text=original_text,
            generate_image=True,
        )
        if not result.get("post_text"):
            return
        updates = {"text": result["post_text"], "status": "pending_review"}
        if result.get("image_path"):
            updates["image_url"] = result["image_path"]

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


def _to_response(p: dict) -> PostResponse:
    return PostResponse(
        id=p["id"],
        text=p["text"],
        image_url=p.get("image_url"),
        news_source=p.get("news_source"),
        news_title=p.get("news_title"),
        status=p.get("status", "draft"),
        notion_page_id=p.get("notion_page_id"),
        linkedin_post_id=p.get("linkedin_post_id"),
        created_at=p.get("created_at", ""),
        published_at=p.get("published_at"),
    )
