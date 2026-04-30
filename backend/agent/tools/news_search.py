from tavily import TavilyClient
from backend.config import get_settings

_client: TavilyClient | None = None


def get_client() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=get_settings().tavily_api_key)
    return _client


SEARCH_QUERIES = [
    "biochar carbon credits sustainability news 2025",
    "ESG carbon offset Africa agriculture news",
    "voluntary carbon market news",
    "sustainability startup LinkedIn viral post",
    "climate tech innovation news",
]


def search_news(query: str, max_results: int = 5) -> list[dict]:
    """Search for recent news articles on a given topic."""
    client = get_client()
    response = client.search(
        query=query,
        search_depth="advanced",
        max_results=max_results,
        include_answer=True,
        include_raw_content=False,
    )
    try:
        from backend.utils.usage_tracker import track_tavily
        track_tavily()
    except Exception:
        pass
    results = []
    for r in response.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
            "score": r.get("score", 0),
        })
    return results


def search_trending_topics() -> list[dict]:
    """Run all default queries and return top results."""
    all_results = []
    for query in SEARCH_QUERIES[:3]:  # limit to 3 queries per run to save API quota
        results = search_news(query, max_results=3)
        all_results.extend(results)
    # deduplicate by URL
    seen = set()
    unique = []
    for r in all_results:
        if r["url"] not in seen:
            seen.add(r["url"])
            unique.append(r)
    return unique
