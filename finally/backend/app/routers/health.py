from fastapi import APIRouter

from app import config

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "market_data_source": "massive" if config.use_massive() else "simulator",
        "llm_mock": config.LLM_MOCK,
    }
