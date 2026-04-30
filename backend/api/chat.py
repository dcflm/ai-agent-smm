from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.agent.core import chat_with_agent

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    message: str


@router.post("/")
async def chat(request: ChatRequest):
    """Send a message to the AI agent and get a response."""
    history = [{"role": m.role, "content": m.content} for m in request.messages]
    response = await chat_with_agent(history, request.message)
    return {"response": response}
