"""
Settings API - lets users view and edit the agent system prompt.
Custom prompt is stored in Supabase Storage (bucket: settings, file: system_prompt.json)
so it survives Render restarts/deploys (no more ephemeral filesystem loss).
The AI refine endpoint lets Claude help rewrite the prompt based on instructions.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_BUCKET = "settings"
SETTINGS_FILE = "system_prompt.json"

# The hardcoded default from core.py - used when no custom file exists
DEFAULT_BASE_PROMPT = """You are an autonomous social media manager for bizpando AG, a sustainability company that turns cotton stalks into biochar to support African farmers and create carbon credits.

Your job is to:
1. Search for relevant news in sustainability, carbon credits, ESG, and biochar
2. Pick the most interesting/viral-worthy story
3. Retrieve relevant company knowledge and past post examples
4. Write an engaging LinkedIn post that ties the news to bizpando AG's mission
5. Generate a matching visual image
6. Submit the draft for employee review

LinkedIn post guidelines:
- Start with a strong hook (question, bold statement, or surprising fact)
- 150-250 words maximum
- Share bizpando AG's perspective/opinion on the news
- End with a call-to-action or thought-provoking question
- Include 3-5 relevant hashtags
- Tone: professional but human, mission-driven, inspiring

IMPORTANT: Always use the tools in this order:
1. search_news - find a relevant story
2. retrieve_company_knowledge - get brand context
3. retrieve_similar_posts - get style examples
4. Write the post text (in your reasoning)
5. generate_image - create a UNIQUE visual specific to the news story (NOT generic farmer/soil/leaves)
6. submit_post_for_review - submit the draft for review

IMAGE PROMPT RULES - always follow these:
- Base the image on the specific news story subject matter
- If the news is about carbon markets - show a trading screen, a graph, a boardroom
- If about satellite data - show satellite imagery, data visualization
- If about biochar production - show industrial pyrolysis equipment, not just soil
- If about policy/regulation - show government buildings, officials, documents
- If about Africa/farming - show specific tech or innovation, not stereotypical imagery
- Always specify: subject, setting, lighting, camera angle, mood"""


def _get_storage():
    from supabase import create_client
    from backend.config import get_settings
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key).storage


def _ensure_bucket(storage) -> None:
    """Create the settings bucket if it doesn't exist (private, no public access)."""
    try:
        storage.create_bucket(SETTINGS_BUCKET, options={"public": False})
    except Exception:
        pass  # already exists


def load_prompt() -> str:
    """Load custom prompt from Supabase Storage, fall back to default."""
    try:
        storage = _get_storage()
        data = storage.from_(SETTINGS_BUCKET).download(SETTINGS_FILE)
        return json.loads(data).get("base_prompt", DEFAULT_BASE_PROMPT)
    except Exception:
        return DEFAULT_BASE_PROMPT


def is_custom_prompt() -> bool:
    """Check if a custom prompt file exists in Supabase Storage."""
    try:
        storage = _get_storage()
        files = storage.from_(SETTINGS_BUCKET).list()
        return any(f.get("name") == SETTINGS_FILE for f in (files or []))
    except Exception:
        return False


def save_prompt(prompt: str) -> None:
    """Save custom prompt to Supabase Storage (upsert)."""
    storage = _get_storage()
    _ensure_bucket(storage)
    storage.from_(SETTINGS_BUCKET).upload(
        path=SETTINGS_FILE,
        file=json.dumps({"base_prompt": prompt}, indent=2).encode(),
        file_options={"content-type": "application/json", "upsert": "true"},
    )


def delete_prompt() -> None:
    """Delete the custom prompt file from Supabase Storage."""
    try:
        _get_storage().from_(SETTINGS_BUCKET).remove([SETTINGS_FILE])
    except Exception:
        pass


class PromptBody(BaseModel):
    prompt: str


class RefineRequest(BaseModel):
    current_prompt: str
    instruction: str


@router.get("/prompt")
async def get_prompt():
    """Return the current agent system prompt (custom or default)."""
    return {
        "prompt": load_prompt(),
        "is_custom": is_custom_prompt(),
    }


@router.post("/prompt")
async def save_custom_prompt(body: PromptBody):
    """Save a custom agent system prompt."""
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty")
    try:
        save_prompt(body.prompt.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)[:200]}")
    return {"message": "Prompt saved", "prompt": body.prompt.strip()}


@router.delete("/prompt")
async def reset_prompt():
    """Reset to the default prompt (delete custom file from Supabase Storage)."""
    try:
        delete_prompt()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)[:200]}")
    return {"message": "Reset to default prompt", "prompt": DEFAULT_BASE_PROMPT}


@router.post("/prompt/refine")
async def refine_prompt(body: RefineRequest):
    """Use Claude to rewrite the system prompt based on user instruction.
    Returns new prompt text - does NOT auto-save. User reviews and saves manually."""
    if not body.instruction.strip():
        raise HTTPException(status_code=422, detail="Instruction cannot be empty")

    try:
        import anthropic
        from backend.config import get_settings
        settings = get_settings()
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            system="""You are a prompt engineering assistant. The user will give you an existing AI system prompt and an instruction for how to modify it.
Your job is to rewrite the system prompt according to the instruction while:
- Preserving all important rules and structure that are not being changed
- Keeping the same general format and sections
- Only changing what the instruction asks for
- NOT adding unnecessary commentary or explanations

Return ONLY the rewritten prompt text, nothing else. No preamble, no "Here is the updated prompt:", just the raw prompt.""",
            messages=[
                {
                    "role": "user",
                    "content": f"CURRENT PROMPT:\n{body.current_prompt}\n\nINSTRUCTION: {body.instruction}\n\nRewrite the prompt according to the instruction.",
                }
            ],
        )
        new_prompt = response.content[0].text.strip()
        try:
            from backend.utils.usage_tracker import track_anthropic
            track_anthropic("refine_prompt", response.usage.input_tokens, response.usage.output_tokens)
        except Exception:
            pass
        return {"prompt": new_prompt}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refinement failed: {str(e)[:200]}")
