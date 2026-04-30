from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.agent.tools.kb_retrieval import ingest_document, search_knowledge_base

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a text/PDF document to the knowledge base."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()

    if file.filename.endswith(".pdf"):
        # Basic PDF text extraction
        try:
            import pypdf
            import io
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise HTTPException(status_code=400, detail="pypdf not installed - upload .txt files")
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Document appears to be empty")

    num_chunks = await ingest_document(file.filename, text)
    return {"message": f"Ingested {num_chunks} chunks from {file.filename}"}


@router.get("/search")
async def search_kb(query: str, top_k: int = 3):
    """Search the knowledge base."""
    try:
        results = await search_knowledge_base(query, top_k=top_k)
        return results
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"KB search unavailable: {str(e)[:120]}")
