"""
Settings API - lets users view and edit the agent system prompt.
Custom prompt is stored in system_prompt_custom.json at the project root.
The AI refine endpoint lets Claude help rewrite the prompt based on instructions.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import os

router = APIRouter(prefix="/settings", tags=["settings"])

PROMPT_FILE = os.path.join(os.path.dirname(__file__), "../../system_prompt_custom.json")

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
6. submit_post_for_review - send to Notion

IMAGE PROMPT RULES - always follow these:
- Base the image on the specific news story subject matter
- If the news is about carbon markets - show a trading screen, a graph, a boardroom
- If about satellite data - show satellite imagery, data visualization
- If about biochar production - show industrial pyrolysis equipment, not just soil
- If about policy/regulation - show government buildings, officials, documents
- If about Africa/farming - show specific tech or innovation, not stereotypical imagery
- Always specify: subject, setting, lighting, camera angle, mood"""


def load_prompt() -> str:
    try:
        with open(PROMPT_FILE) as f:
            data = json.load(f)
            return data.get("base_prompt", DEFAULT_BASE_PROMPT)
    except Exception:
        return DEFAULT_BASE_PROMPT


def save_prompt(prompt: str) -> None:
    with open(PROMPT_FILE, "w") as f:
        json.dump({"base_prompt": prompt}, f, indent=2)


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
        "is_custom": os.path.exists(PROMPT_FILE),
    }


@router.post("/prompt")
async def save_custom_prompt(body: PromptBody):
    """Save a custom agent system prompt."""
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="Prompt cannot be empty")
    save_prompt(body.prompt.strip())
    return {"message": "Prompt saved", "prompt": body.prompt.strip()}


@router.delete("/prompt")
async def reset_prompt():
    """Reset to the default prompt (delete custom file)."""
    try:
        if os.path.exists(PROMPT_FILE):
            os.remove(PROMPT_FILE)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset failed: {e}")
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
