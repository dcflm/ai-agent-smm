"""
Create endpoints:
  POST /create/from-image  — generate post from uploaded photos + context
  POST /create/from-url    — generate post from a news article URL
"""
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import base64
import os
import re
import asyncio
import httpx
import anthropic
from html.parser import HTMLParser

from backend.config import get_settings
from backend.db import get_supabase

router = APIRouter(prefix="/create", tags=["create"])

SUPPORTED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MAX_IMAGES = 3

# ── Helpers ───────────────────────────────────────────────────────────────────

BUCKET = "post-images"


def _save_image(content: bytes, original_filename: str) -> str:
    """Save uploaded image to Supabase Storage (permanent) or local filesystem (fallback)."""
    ext = os.path.splitext(original_filename)[1].lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"

    # Try Supabase Storage first
    try:
        from supabase import create_client
        settings = get_settings()
        db = create_client(settings.supabase_url, settings.supabase_service_role_key)
        try:
            db.storage.create_bucket(BUCKET, options={"public": True})
        except Exception:
            pass
        mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")
        db.storage.from_(BUCKET).upload(
            path=filename,
            file=content,
            file_options={"content-type": mime, "upsert": "true"},
        )
        return db.storage.from_(BUCKET).get_public_url(filename)
    except Exception as exc:
        print(f"[create] Supabase Storage upload failed: {exc}")

    # Fallback: local filesystem
    filepath = os.path.join("static", "images", filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


def _get_media_type(content_type: str | None, filename: str) -> str:
    if content_type and content_type in SUPPORTED_TYPES:
        return content_type
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")


class _HtmlTextExtractor(HTMLParser):
    SKIP = {"script", "style", "head", "nav", "footer", "header", "aside", "noscript"}
    NEWLINE = {"p", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "article"}

    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1
        elif tag in self.NEWLINE and self._skip_depth == 0:
            self.parts.append("\n")

    def handle_endtag(self, tag: str):
        if tag in self.SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)

    def handle_data(self, data: str):
        if self._skip_depth == 0:
            self.parts.append(data)


def _html_to_text(html: str, max_chars: int = 7000) -> str:
    parser = _HtmlTextExtractor()
    parser.feed(html)
    raw = "".join(parser.parts)
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()[:max_chars]


# ── Create from uploaded images ───────────────────────────────────────────────

@router.post("/from-image")
async def create_post_from_image(
    context: str = Form(...),
    location: Optional[str] = Form(None),
    people: Optional[str] = Form(None),
    images: list[UploadFile] = File(...),
):
    """
    Generate a LinkedIn post from uploaded images + context.
    Uses Claude vision - posts are based ONLY on the provided information.
    """
    if not context.strip():
        raise HTTPException(status_code=422, detail="Context/caption is required")
    if len(images) > MAX_IMAGES:
        raise HTTPException(status_code=422, detail=f"Maximum {MAX_IMAGES} images allowed")

    image_data: list[dict] = []
    saved_paths: list[str] = []

    for img in images:
        if not img.filename:
            continue
        content = await img.read()
        if len(content) == 0:
            continue
        media_type = _get_media_type(img.content_type, img.filename)
        if media_type not in SUPPORTED_TYPES:
            raise HTTPException(status_code=422, detail=f"Unsupported image type: {media_type}. Use JPEG, PNG, WebP, or GIF.")
        b64 = base64.standard_b64encode(content).decode("utf-8")
        image_data.append({"media_type": media_type, "data": b64, "filename": img.filename})
        saved_paths.append(_save_image(content, img.filename))

    if not image_data:
        raise HTTPException(status_code=422, detail="At least one valid image is required")

    context_parts = [f"POST CONTEXT:\n{context.strip()}"]
    if location:
        context_parts.append(f"LOCATION: {location.strip()}")
    if people:
        context_parts.append(f"PEOPLE IN PHOTO: {people.strip()}")
    context_parts.append(f"NUMBER OF IMAGES: {len(image_data)}")
    full_context = "\n".join(context_parts)

    content_blocks: list[dict] = []
    for img_info in image_data:
        content_blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img_info["media_type"],
                "data": img_info["data"],
            },
        })
    content_blocks.append({
        "type": "text",
        "text": f"{full_context}\n\nWrite a LinkedIn post based ONLY on the information and images provided above.",
    })

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system_prompt = """You are a LinkedIn post writer for bizpando AG, a sustainability company that turns cotton stalks into biochar to support African farmers and create carbon credits.

Your task is to write a LinkedIn post based ONLY on the provided images and context information.

STRICT RULES:
- Use ONLY the information given to you. Do NOT invent facts, statistics, or details not provided.
- Do NOT add news references, external data, or fabricated context.
- Describe what is actually visible in the images.
- Use the provided location, people names/titles, and context as-is.
- If something is unclear from the images, describe what you see without guessing.

POST FORMAT:
- Start with an engaging hook based on the actual content
- 150-250 words
- Professional LinkedIn tone, mission-driven, authentic
- End with a thought-provoking question or call-to-action related to what is shown
- Include 3-5 relevant hashtags at the end

Write only the post text - no commentary, no "Here is the post:", just the post itself."""

    try:
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": content_blocks}],
        )
        post_text = response.content[0].text.strip()
        try:
            from backend.utils.usage_tracker import track_anthropic
            track_anthropic("create_from_image", response.usage.input_tokens, response.usage.output_tokens)
        except Exception:
            pass
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Post generation failed: {str(e)[:200]}")

    if not post_text:
        raise HTTPException(status_code=500, detail="Claude returned an empty response")

    post_id = str(uuid.uuid4())
    primary_image = saved_paths[0] if saved_paths else None

    db = get_supabase()
    db.table("posts").insert({
        "id": post_id,
        "text": post_text,
        "image_url": primary_image,
        "news_source": "source:photo",
        "news_title": location or context[:60],
        "status": "pending_review",
    }).execute()

    return {
        "post_id": post_id,
        "text": post_text,
        "image_url": primary_image,
    }


# ── Create from company news (strictly grounded) ─────────────────────────────

class FromNewsRequest(BaseModel):
    news: str
    generate_image: bool = True


@router.post("/from-news")
async def create_post_from_news(payload: FromNewsRequest):
    """
    Turn a short company news item into a LinkedIn post that uses ONLY the
    provided information — no web search, no invented facts. Optionally
    generates an AI image matched to the post content.
    """
    news = payload.news.strip()
    if len(news) < 20:
        raise HTTPException(
            status_code=422,
            detail="Please describe the news in a bit more detail (at least a couple of sentences).",
        )

    settings = get_settings()
    company = settings.company_name
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system_prompt = f"""You are a LinkedIn post writer for {company}, a sustainability company that turns cotton stalks into biochar to support African farmers and create carbon credits.

The company will give you a short internal news item. Write a LinkedIn post announcing it.

STRICT RULES — these override everything else:
- Use ONLY the information provided in the news item. Every fact, name, number, date, location, and claim in your post must appear in the provided text.
- Do NOT invent statistics, quotes, partner names, dates, or details of any kind.
- Do NOT add external news references, industry data, or background facts.
- You may add tone, framing, and enthusiasm — but zero new factual content.
- If the news item is short on details, write a shorter post. Never pad with invented specifics.

POST FORMAT:
- Start with an engaging hook based on the actual news
- 100-250 words, matched to how much real information was provided
- Professional LinkedIn tone: authentic, mission-driven, not salesy
- End with a call-to-action or thought-provoking question
- Include 3-5 relevant hashtags at the end

Write only the post text — no preamble, no "Here is the post:", just the post itself."""

    try:
        response = await asyncio.to_thread(
            client.messages.create,
            model=settings.claude_model,
            max_tokens=1024,
            temperature=0.3,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": f"COMPANY NEWS:\n{news}\n\nWrite the LinkedIn post now, using only the information above.",
            }],
        )
        post_text = response.content[0].text.strip()
        try:
            from backend.utils.usage_tracker import track_anthropic
            track_anthropic("create_from_news", response.usage.input_tokens, response.usage.output_tokens)
        except Exception:
            pass
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Post generation failed: {str(e)[:200]}")

    if not post_text:
        raise HTTPException(status_code=500, detail="Claude returned an empty response")

    # Optional image, matched to the post content
    image_path: str | None = None
    if payload.generate_image:
        try:
            prompt_resp = await asyncio.to_thread(
                client.messages.create,
                model=settings.claude_model,
                max_tokens=150,
                system=(
                    "You write prompts for an image-generation model. Given a LinkedIn post, "
                    "describe in one sentence a professional visual scene that matches its content. "
                    "Describe only what is visible (subject, setting, lighting, mood). "
                    "No text overlays, no logos. Reply with the prompt only."
                ),
                messages=[{"role": "user", "content": post_text}],
            )
            img_prompt = prompt_resp.content[0].text.strip()
            try:
                from backend.utils.usage_tracker import track_anthropic
                track_anthropic("create_from_news", prompt_resp.usage.input_tokens, prompt_resp.usage.output_tokens)
            except Exception:
                pass
            from backend.agent.tools.image_gen import generate_image as gen_img
            image_path = await asyncio.to_thread(gen_img, img_prompt)
        except Exception as e:
            print(f"[create_from_news] Image generation skipped: {e}")

    news_title = news.splitlines()[0][:80]
    post_id = str(uuid.uuid4())
    db = get_supabase()
    db.table("posts").insert({
        "id": post_id,
        "text": post_text,
        "image_url": image_path,
        "news_source": "source:company-news",
        "news_title": news_title,
        "status": "pending_review",
    }).execute()

    return {
        "post_id": post_id,
        "text": post_text,
        "image_url": image_path,
        "news_title": news_title,
    }


# ── Create from news URL ──────────────────────────────────────────────────────

class FromUrlRequest(BaseModel):
    url: str
    extra_context: Optional[str] = None
    generate_image: bool = False


@router.post("/from-url")
async def create_post_from_url(payload: FromUrlRequest):
    """
    Fetch a news article from a URL and generate a LinkedIn post about it.
    Claude writes the post grounded in the actual article content.
    Optionally generates an AI image for the post.
    """
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=422, detail="URL is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # Fetch the article
    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            },
        ) as client:
            r = await client.get(url)
        if r.status_code >= 400:
            raise HTTPException(
                status_code=422,
                detail=f"Could not fetch article (HTTP {r.status_code}). Check the URL or try a different link."
            )
        article_text = _html_to_text(r.text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to fetch URL: {str(e)[:200]}")

    if len(article_text) < 100:
        raise HTTPException(
            status_code=422,
            detail="Could not extract readable content from this URL. The page may require a login or block automated access."
        )

    # Derive source info from URL
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        news_source_domain = parsed.netloc.replace("www.", "")
        slug = parsed.path.strip("/").split("/")[-1].replace("-", " ").replace("_", " ")
        news_title = slug[:80] if slug else news_source_domain
    except Exception:
        news_source_domain = url[:60]
        news_title = "News article"

    # Build prompt
    user_message = f"ARTICLE URL: {url}\n\nARTICLE CONTENT:\n{article_text}"
    if payload.extra_context and payload.extra_context.strip():
        user_message += f"\n\nADDITIONAL NOTES FROM USER: {payload.extra_context.strip()}"
    user_message += "\n\nWrite a LinkedIn post about this news article for bizpando AG."

    system_prompt = """You are a LinkedIn content writer for bizpando AG — a Swiss sustainability company that produces biochar from agricultural waste (cotton stalks) to support African smallholder farmers, sequester carbon, and generate verified carbon credits.

Your task: read the news article provided and write an engaging LinkedIn post that shares this news with bizpando AG's professional network.

WRITING RULES:
- Ground the post in the actual article content — do not invent statistics or quotes not present in the article
- Connect the news to sustainability, climate, carbon markets, biochar, or bizpando AG's mission where it is genuinely relevant
- If the user provided additional notes, incorporate their perspective or angle
- Professional LinkedIn tone: informative, mission-driven, not salesy
- Start with a strong hook that captures why this news matters
- 150-250 words
- End with a thought-provoking question or call-to-action
- Include 3-5 relevant hashtags at the end

Write only the post text — no preamble, no "Here is the post:", just the post itself."""

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        post_text = response.content[0].text.strip()
        try:
            from backend.utils.usage_tracker import track_anthropic
            track_anthropic("create_from_url", response.usage.input_tokens, response.usage.output_tokens)
        except Exception:
            pass
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Post generation failed: {str(e)[:200]}")

    if not post_text:
        raise HTTPException(status_code=500, detail="Claude returned an empty response")

    # Optional image generation
    image_path: str | None = None
    if payload.generate_image:
        try:
            from backend.agent.tools.image_gen import generate_image as gen_img
            img_prompt = (
                f"Professional LinkedIn post visual about {news_title}. "
                f"Corporate, clean, modern photography. No text overlays."
            )
            image_path = await asyncio.to_thread(gen_img, img_prompt)
        except Exception as e:
            print(f"[create_from_url] Image generation skipped: {e}")

    # Save to DB
    post_id = str(uuid.uuid4())
    db = get_supabase()
    db.table("posts").insert({
        "id": post_id,
        "text": post_text,
        "image_url": image_path,
        "news_source": f"source:url:{news_source_domain}",
        "news_title": news_title,
        "status": "pending_review",
    }).execute()

    return {
        "post_id": post_id,
        "text": post_text,
        "image_url": image_path,
        "news_title": news_title,
        "news_source": news_source_domain,
    }
