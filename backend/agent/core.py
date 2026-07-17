"""
Core AI agent using Anthropic Claude with tool_use.
This is the main agentic loop that orchestrates:
  - News search (Tavily)
  - RAG retrieval (Supabase pgvector)
  - Post text generation (Claude)
  - Image generation (Nano Banana, optional)
"""
import asyncio
import json
import anthropic
from backend.config import get_settings
from backend.agent.tools.news_search import search_news
from backend.agent.tools.image_gen import generate_image
from backend.agent.memory.rag import retrieve_kb_chunks, retrieve_similar_posts
from backend.agent.memory.style_rules import get_recent_style_rules

# Tool definitions for Claude
TOOLS: list[dict] = [
    {
        "name": "search_news",
        "description": "Search for recent news articles on a given topic. Use this to find relevant sustainability, carbon credit, or ESG news.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query for news articles",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "retrieve_company_knowledge",
        "description": "Retrieve relevant information from the bizpando AG company knowledge base. Use this to get brand guidelines, tone of voice, and company background.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to look up in the knowledge base",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "retrieve_similar_posts",
        "description": "Retrieve previously approved/published LinkedIn posts similar to the topic. Use these as style and format examples.",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "The topic or theme of the post to find examples for",
                }
            },
            "required": ["topic"],
        },
    },
    {
        "name": "generate_image",
        "description": "Generate a unique visual image for the LinkedIn post. The prompt MUST be specific to the news story - reference the actual subject matter (e.g. satellite imagery of deforestation, a carbon credit trading floor, an EU Parliament building, biochar pellets in a lab, African farmland from above). NEVER use generic 'farmer with soil' or 'green leaves' imagery.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Highly specific visual prompt derived from the actual news content. Include: the specific subject (what is shown), setting/location, mood/lighting, camera angle. Example: 'Aerial view of a carbon credit monitoring station in rural Kenya at golden hour, scientific equipment, expansive savannah background, cinematic photography'",
                }
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "submit_post_for_review",
        "description": "Submit the completed LinkedIn post for review. Call this when the post text (and optionally image) are ready.",
        "input_schema": {
            "type": "object",
            "properties": {
                "post_text": {
                    "type": "string",
                    "description": "The complete LinkedIn post text including hashtags",
                },
                "image_path": {
                    "type": "string",
                    "description": "The file path of the generated image (if image was generated)",
                },
                "news_title": {
                    "type": "string",
                    "description": "Title of the news article that inspired this post",
                },
                "news_url": {
                    "type": "string",
                    "description": "URL of the source news article",
                },
            },
            "required": ["post_text"],
        },
    },
]

# Tools list without image generation (used when generate_image=False)
TOOLS_NO_IMAGE = [t for t in TOOLS if t["name"] != "generate_image"]


def _load_custom_base_prompt() -> str | None:
    """Load custom base prompt from Supabase Storage (survives Render restarts)."""
    try:
        from backend.api.settings import _get_storage, SETTINGS_BUCKET, SETTINGS_FILE
        storage = _get_storage()
        data = storage.from_(SETTINGS_BUCKET).download(SETTINGS_FILE)
        return json.loads(data).get("base_prompt")
    except Exception:
        return None


async def build_system_prompt(generate_image: bool = True) -> str:
    """Build the agent system prompt with learned style rules injected."""
    style_rules = await get_recent_style_rules()

    # Use custom prompt if saved via Settings page, otherwise use hardcoded default
    custom = await asyncio.to_thread(_load_custom_base_prompt)

    base = custom if custom else """You are an autonomous social media manager for bizpando AG, a sustainability company that turns cotton stalks into biochar to support African farmers and create carbon credits.

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
1. search_news → find a relevant story
2. retrieve_company_knowledge → get brand context
3. retrieve_similar_posts → get style examples
4. Write the post text (in your reasoning)
{image_step}5. submit_post_for_review → finalize and submit the post

{image_rules}"""

    # Fill in image generation steps if using the default prompt
    if not custom:
        if generate_image:
            image_step = "5. generate_image → create a UNIQUE visual specific to the news story (NOT generic farmer/soil/leaves)\n"
            image_rules = """IMAGE PROMPT RULES - always follow these:
- Base the image on the specific news story subject matter
- If the news is about carbon markets → show a trading screen, a graph, a boardroom
- If about satellite data → show satellite imagery, data visualization
- If about biochar production → show industrial pyrolysis equipment, not just soil
- If about policy/regulation → show government buildings, officials, documents
- If about Africa/farming → show specific tech or innovation, not stereotypical imagery
- Always specify: subject, setting, lighting, camera angle, mood"""
        else:
            image_step = ""
            image_rules = "Do NOT generate an image for this post - skip directly to submit_post_for_review."
        base = base.format(image_step=image_step, image_rules=image_rules)

    if style_rules:
        rules_text = "\n".join(f"- {r}" for r in style_rules)
        base += f"\n\nLEARNED STYLE RULES (from employee feedback):\n{rules_text}"

    return base


def _normalize_url(url: str) -> str:
    """Strip fragment and trailing slash for dedup comparison."""
    return url.split("#")[0].rstrip("/").lower()


def _fetch_used_news_urls() -> set[str]:
    """Return normalized URLs of every news source already stored in posts (sync)."""
    try:
        from backend.db import get_supabase
        db = get_supabase()
        res = db.table("posts").select("news_source").not_.is_("news_source", "null").execute()
        urls: set[str] = set()
        for row in (res.data or []):
            src = (row.get("news_source") or "").strip()
            if src.startswith("http"):
                urls.add(_normalize_url(src))
        return urls
    except Exception as e:
        print(f"[url_dedup] Could not fetch used URLs: {e}")
        return set()


async def _execute_tool(tool_name: str, tool_input: dict, used_urls: set[str] | None = None) -> str:
    """Execute a tool call and return the result as a string."""
    if tool_name == "search_news":
        try:
            # Run synchronous Tavily call in a thread pool with a 30-second timeout
            results = await asyncio.wait_for(
                asyncio.to_thread(
                    search_news,
                    query=tool_input["query"],
                    max_results=tool_input.get("max_results", 8),  # fetch more so filtering leaves enough
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            print("[search_news] Tavily search timed out after 30s, returning empty results")
            results = []
        except Exception as e:
            print(f"[search_news] Tavily error: {e}")
            results = []

        # Filter out already-used URLs
        if used_urls and results:
            original_count = len(results)
            results = [r for r in results if _normalize_url(r.get("url", "")) not in used_urls]
            filtered = original_count - len(results)
            if filtered:
                print(f"[url_dedup] Filtered {filtered} already-used article(s) from search results")

        if not results:
            return json.dumps({
                "message": (
                    "All articles found for this query have already been used in previous posts. "
                    "Please search with a completely different query, a different angle, or a more specific/recent topic."
                )
            }, ensure_ascii=False)

        return json.dumps(results, ensure_ascii=False)

    elif tool_name == "retrieve_company_knowledge":
        chunks = await retrieve_kb_chunks(tool_input["query"])
        if not chunks:
            return "No relevant company knowledge found."
        return "\n\n".join(f"[{c['doc_name']}]: {c['chunk_text']}" for c in chunks)

    elif tool_name == "retrieve_similar_posts":
        posts = await retrieve_similar_posts(tool_input["topic"])
        if not posts:
            return "No similar past posts found yet. Write an original post."
        return "\n\n---\n\n".join(
            f"EXAMPLE POST (engagement: {p.get('metadata', {}).get('engagement_rate', 'N/A')}%):\n{p['post_text']}"
            for p in posts
        )

    elif tool_name == "generate_image":
        try:
            path = await asyncio.to_thread(generate_image, tool_input["prompt"])
            return json.dumps({"image_path": path})
        except Exception as e:
            print(f"[image_gen] Failed: {e}")
            return json.dumps({"image_path": None, "error": str(e)})

    elif tool_name == "submit_post_for_review":
        # This is called by the generate_post_for_news function after db insert
        # Return the data so the caller can handle the DB update
        return json.dumps(tool_input)

    return f"Unknown tool: {tool_name}"


async def generate_post_for_news(
    news_query: str | None = None,
    revision_context: str | None = None,
    original_post_text: str | None = None,
    generate_image: bool = True,
) -> dict:
    """
    Main agent loop. Generates a LinkedIn post (text + image) and returns result.

    Args:
        news_query: Optional specific news topic to search for
        revision_context: Employee feedback for revision (used in change-request flow)
        original_post_text: The original post being revised

    Returns:
        dict with keys: post_text, image_path, news_title, news_url
    """
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    system_prompt = await build_system_prompt(generate_image=generate_image)
    active_tools = TOOLS if generate_image else TOOLS_NO_IMAGE

    user_message = "Generate a new LinkedIn post based on recent news in our space."
    if news_query:
        user_message = f"Generate a LinkedIn post about: {news_query}"
    if revision_context and original_post_text:
        user_message = (
            f"Revise the following LinkedIn post based on employee feedback.\n\n"
            f"ORIGINAL POST:\n{original_post_text}\n\n"
            f"EMPLOYEE FEEDBACK:\n{revision_context}\n\n"
            f"Generate an improved version, then create a new image and resubmit."
        )

    # Load already-used news URLs so the agent never repeats the same source.
    # Skip this for revisions — we're updating an existing post, not finding new news.
    used_urls: set[str] = set()
    if not (revision_context and original_post_text):
        used_urls = await asyncio.to_thread(_fetch_used_news_urls)
        if used_urls:
            print(f"[url_dedup] {len(used_urls)} previously used URL(s) will be excluded from search results")

    messages = [{"role": "user", "content": user_message}]
    result = {
        "post_text": "",
        "image_path": None,
        "news_title": None,
        "news_url": None,
    }

    # Agentic loop
    while True:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=4096,
            system=system_prompt,
            tools=active_tools,
            messages=messages,
        )
        try:
            from backend.utils.usage_tracker import track_anthropic
            track_anthropic("generation", response.usage.input_tokens, response.usage.output_tokens)
        except Exception:
            pass

        # Add assistant response to message history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                tool_output = await _execute_tool(block.name, block.input, used_urls=used_urls)

                # Capture final submission data
                if block.name == "submit_post_for_review":
                    data = json.loads(tool_output)
                    result["post_text"] = data.get("post_text", "")
                    result["image_path"] = data.get("image_path")
                    result["news_title"] = data.get("news_title")
                    result["news_url"] = data.get("news_url")

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": tool_output,
                })

            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return result


async def chat_with_agent(conversation_history: list[dict], user_message: str) -> str:
    """
    Conversational interface for the dashboard chat panel.
    Handles freeform user requests (request post, ask about KPIs, etc.)
    """
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    style_rules = await get_recent_style_rules()

    system = """You are the bizpando AG social media AI assistant. You help the team manage their LinkedIn presence.
You can discuss post performance, suggest content ideas, explain your decisions, and generate new post drafts on request.
Be concise and helpful. If the user asks you to generate a post, explain that you'll start the generation pipeline."""

    if style_rules:
        system += "\n\nLearned style rules: " + "; ".join(style_rules[:5])

    messages = list(conversation_history)
    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    try:
        from backend.utils.usage_tracker import track_anthropic
        track_anthropic("chat", response.usage.input_tokens, response.usage.output_tokens)
    except Exception:
        pass
    return response.content[0].text
