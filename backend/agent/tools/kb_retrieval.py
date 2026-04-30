"""
Knowledge base retrieval tool - thin wrapper used by FastAPI routes.
The actual logic lives in agent/memory/rag.py.
"""
from backend.agent.memory.rag import retrieve_kb_chunks, store_kb_chunk, chunk_text


async def ingest_document(doc_name: str, content: str) -> int:
    """
    Chunk and embed a document into the knowledge base.
    Returns the number of chunks stored.
    """
    chunks = chunk_text(content, chunk_size=1000, overlap=200)
    for chunk in chunks:
        await store_kb_chunk(doc_name, chunk)
    return len(chunks)


async def search_knowledge_base(query: str, top_k: int = 3) -> list[dict]:
    """Search the knowledge base for relevant chunks."""
    return await retrieve_kb_chunks(query, top_k=top_k)
