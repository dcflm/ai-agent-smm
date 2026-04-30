from notion_client import AsyncClient
from backend.config import get_settings

# Map internal statuses to Notion select option names
STATUS_TO_NOTION = {
    "pending_review": "Pending Review",
    "approved": "Approved",
    "published": "Approved",
    "rejected": "Rejected",
    "changes_requested": "Changes Requested",
}


def get_client() -> AsyncClient:
    return AsyncClient(auth=get_settings().notion_token)


async def update_page_status(page_id: str, status: str) -> None:
    """Update the Status select property on a Notion page."""
    notion_status = STATUS_TO_NOTION.get(status)
    if not notion_status or not page_id:
        return
    client = get_client()
    await client.pages.update(
        page_id=page_id,
        properties={"Status": {"select": {"name": notion_status}}},
    )


async def archive_page(page_id: str) -> None:
    """Archive (soft-delete) a Notion page. This is the Notion API equivalent of delete."""
    if not page_id:
        return
    client = get_client()
    await client.pages.update(page_id=page_id, archived=True)


async def create_post_page(
    post_id: str,
    text: str,
    image_url: str | None,
    news_title: str | None,
    news_source: str | None,
) -> str:
    """Create a page in the Notion review database. Returns the Notion page ID."""
    client = get_client()
    settings = get_settings()

    properties: dict = {
        "Post ID": {"rich_text": [{"text": {"content": post_id}}]},
        "Status": {"select": {"name": "Pending Review"}},
        "News Title": {"rich_text": [{"text": {"content": news_title or ""}}]},
        "News Source": {"url": news_source} if news_source else {"rich_text": []},
    }

    children = [
        {
            "object": "block",
            "type": "heading_2",
            "heading_2": {
                "rich_text": [{"type": "text", "text": {"content": "Post Text"}}]
            },
        },
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": text}}]
            },
        },
    ]

    if image_url:
        children.append({
            "object": "block",
            "type": "heading_2",
            "heading_2": {
                "rich_text": [{"type": "text", "text": {"content": "Generated Image"}}]
            },
        })
        if image_url.startswith("http"):
            children.append({
                "object": "block",
                "type": "image",
                "image": {"type": "external", "external": {"url": image_url}},
            })
        else:
            children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": f"Image path: {image_url}"}}]
                },
            })

    children.append({
        "object": "block",
        "type": "heading_2",
        "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "Employee Feedback"}}]
        },
    })
    children.append({
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [{"type": "text", "text": {"content": "Write your feedback or change requests here..."}}]
        },
    })

    page = await client.pages.create(
        parent={"database_id": settings.notion_database_id},
        properties=properties,
        children=children,
    )
    return page["id"]


async def get_page(page_id: str) -> dict:
    """Fetch a Notion page and its blocks."""
    client = get_client()
    page = await client.pages.retrieve(page_id=page_id)
    blocks = await client.blocks.children.list(block_id=page_id)
    return {"page": page, "blocks": blocks.get("results", [])}


async def get_pending_pages() -> list[dict]:
    """Query all pages with status Pending Review or Changes Requested."""
    client = get_client()
    settings = get_settings()

    response = await client.databases.query(
        database_id=settings.notion_database_id,
        filter={
            "or": [
                {"property": "Status", "select": {"equals": "Pending Review"}},
                {"property": "Status", "select": {"equals": "Changes Requested"}},
            ]
        },
    )
    return response.get("results", [])


async def extract_feedback_from_page(page_id: str) -> str:
    """Extract the employee feedback text from a Notion page."""
    client = get_client()
    blocks = await client.blocks.children.list(block_id=page_id)
    results = blocks.get("results", [])

    feedback_section = False
    feedback_lines = []
    for block in results:
        if block["type"] == "heading_2":
            title = "".join(
                t["plain_text"]
                for t in block["heading_2"]["rich_text"]
            )
            feedback_section = "Employee Feedback" in title
            continue
        if feedback_section and block["type"] == "paragraph":
            text = "".join(
                t["plain_text"]
                for t in block["paragraph"]["rich_text"]
            )
            if text and "Write your feedback" not in text:
                feedback_lines.append(text)

    return "\n".join(feedback_lines)
