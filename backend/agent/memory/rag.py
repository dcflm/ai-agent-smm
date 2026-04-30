"""
RAG (Retrieval-Augmented Generation) module.
Uses Supabase pgvector for similarity search.
Embeddings are generated via OpenAI text-embedding-3-small (1536 dims)
or can be swapped to Voyage/Cohere.
"""
import json
import httpx
from backend.config import get_settings

EMBEDDING_ENDPOINT = "https://api.openai.com/v1/embeddings"
EMBEDDING_DIM = 1536


async def embed_text(text: str) -> list[float]:
    """Generate an embedding vector for a text string."""
    settings = get_settings()
    # We use OpenAI embeddings here (small, fast, cheap)
    # You can swap this to Voyage or Cohere if preferred
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            EMBEDDING_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": settings.embedding_model, "input": text},
        )
        response.raise_for_status()
        data = response.json()
        try:
            from backend.utils.usage_tracker import track_openai
            track_openai(data.get("usage", {}).get("total_tokens", 0))
        except Exception:
            pass
        return data["data"][0]["embedding"]


async def retrieve_kb_chunks(query: str, top_k: int | None = None) -> list[dict]:
    """Retrieve the most relevant knowledge base chunks for a query."""
    from supabase import create_client, Client
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key or not settings.openai_api_key:
        return []
    try:
        k = top_k or settings.rag_top_k
        embedding = await embed_text(query)
        supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        result = supabase.rpc(
            "match_knowledge_base",
            {"query_embedding": embedding, "match_count": k},
        ).execute()
        return result.data or []
    except Exception:
        return []


async def retrieve_similar_posts(query: str, top_k: int | None = None) -> list[dict]:
    """Retrieve similar published posts as few-shot examples."""
    from supabase import create_client, Client
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key or not settings.openai_api_key:
        return []
    try:
        k = top_k or settings.rag_top_k
        embedding = await embed_text(query)
        supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        result = supabase.rpc(
            "match_posts",
            {
                "query_embedding": embedding,
                "match_count": k,
                "filter_status": "published",
            },
        ).execute()
        return result.data or []
    except Exception:
        return []


async def store_kb_chunk(doc_name: str, chunk_text: str) -> None:
    """Store a knowledge base chunk with its embedding."""
    from supabase import create_client
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    embedding = await embed_text(chunk_text)
    supabase.table("knowledge_base").insert({
        "doc_name": doc_name,
        "chunk_text": chunk_text,
        "embedding": embedding,
    }).execute()


async def store_post_embedding(post_id: str, post_text: str, metadata: dict) -> None:
    """Store a post embedding for future RAG retrieval."""
    from supabase import create_client
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    embedding = await embed_text(post_text)
    supabase.table("post_embeddings").insert({
        "post_id": post_id,
        "embedding": embedding,
        "metadata": metadata,
    }).execute()


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks
