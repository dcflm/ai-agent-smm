"""
Image generation using Nano Banana API.
Async flow: submit task → poll until complete → upload to Supabase Storage.
"""
import os
import uuid
import time
import httpx
from backend.config import get_settings

BUCKET = "post-images"


def _upload_to_supabase(img_bytes: bytes, filename: str) -> str | None:
    """Upload image bytes to Supabase Storage and return a permanent public URL."""
    try:
        from supabase import create_client
        settings = get_settings()
        db = create_client(settings.supabase_url, settings.supabase_service_role_key)

        # Ensure bucket exists (idempotent – ignores already-exists error)
        try:
            db.storage.create_bucket(BUCKET, options={"public": True})
        except Exception:
            pass

        db.storage.from_(BUCKET).upload(
            path=filename,
            file=img_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return db.storage.from_(BUCKET).get_public_url(filename)
    except Exception as exc:
        print(f"[image_gen] Supabase Storage upload failed: {exc}")
        return None

API_BASE = "https://api.nanobananaapi.ai/api/v1/nanobanana"
BRAND_STYLE_SUFFIX = (
    "Professional LinkedIn visual. Clean, modern, editorial style. "
    "No text overlays. No watermarks. High quality photorealistic render."
)
POLL_INTERVAL = 3   # seconds between status checks
TIMEOUT = 300       # max 5 minutes


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {get_settings().nano_banana_api_key}",
        "Content-Type": "application/json",
    }


def generate_image(prompt: str, output_dir: str = "static/images") -> str:
    """
    Generate an image via Nano Banana API (synchronous polling).
    Returns the local file path relative to the backend root.
    """
    full_prompt = f"{prompt}. {BRAND_STYLE_SUFFIX}"

    # 1. Submit generation task
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{API_BASE}/generate",
            headers=_headers(),
            json={
                "prompt": full_prompt,
                "type": "TEXTTOIAMGE",  # API has this intentional typo
                "numImages": 1,
                "image_size": "3:4",
                "callBackUrl": "",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        api_code = data.get("code")
        if api_code == 402:
            raise RuntimeError("Nano Banana: insufficient credits - please top up at nanobananaapi.ai")
        if not data.get("data"):
            raise RuntimeError(f"Nano Banana API error: {data.get('msg', 'Unknown error')} (code {api_code})")
        task_id = data["data"]["taskId"]

    # 2. Poll until complete
    deadline = time.time() + TIMEOUT
    image_url: str | None = None

    with httpx.Client(timeout=30) as client:
        while time.time() < deadline:
            time.sleep(POLL_INTERVAL)
            status_resp = client.get(
                f"{API_BASE}/record-info",
                headers=_headers(),
                params={"taskId": task_id},
            )
            status_resp.raise_for_status()
            status_data = status_resp.json()
            flag = status_data.get("data", {}).get("successFlag")

            if flag == 1:
                # Success - grab image URL from response.resultImageUrl
                response = status_data.get("data", {}).get("response") or {}
                image_url = response.get("resultImageUrl") or response.get("originImageUrl")
                break
            elif flag in (2, 3):
                raise RuntimeError(f"Nano Banana generation failed (flag={flag})")
            # flag == 0 → still generating, keep polling

    if not image_url:
        try:
            from backend.utils.usage_tracker import track_nano_banana
            track_nano_banana(False)
        except Exception:
            pass
        raise RuntimeError("Nano Banana: timed out or no image URL in response")

    # 3. Download the image bytes
    filename = f"{uuid.uuid4()}.png"
    with httpx.Client(timeout=60) as client:
        img_resp = client.get(image_url)
        img_resp.raise_for_status()
        img_bytes = img_resp.content

    try:
        from backend.utils.usage_tracker import track_nano_banana
        track_nano_banana(True)
    except Exception:
        pass

    # 4a. Try Supabase Storage (persistent, survives restarts)
    supabase_url = _upload_to_supabase(img_bytes, filename)
    if supabase_url:
        return supabase_url

    # 4b. Fallback: save to local filesystem
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "wb") as f:
        f.write(img_bytes)
    return filepath
