from fastapi import APIRouter, HTTPException

from app.llm.schemas import ChatRequest, ChatResponse
from app.llm.service import handle_chat
from db import dao

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    return await handle_chat(message)


@router.get("/chat/history")
async def get_chat_history() -> dict:
    """§13.13: full chat log, oldest first, to hydrate the chat panel on reload."""
    return {"messages": await dao.get_all_chat_messages()}
