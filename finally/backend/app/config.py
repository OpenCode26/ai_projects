import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(PROJECT_ROOT / ".env")

DEFAULT_USER_ID = "default"

# Frontend static export. Absent in local dev; populated at /app/static in Docker.
STATIC_DIR = Path(os.getenv("FINALLY_STATIC_DIR") or (BACKEND_DIR / "static"))

MASSIVE_API_KEY = (os.getenv("MASSIVE_API_KEY") or "").strip()
OPENROUTER_API_KEY = (os.getenv("OPENROUTER_API_KEY") or "").strip()
LLM_MOCK = (os.getenv("LLM_MOCK") or "").strip().lower() == "true"

PRICE_TICK_SECONDS = float(os.getenv("FINALLY_PRICE_TICK_SECONDS") or 0.5)
SNAPSHOT_INTERVAL_SECONDS = float(os.getenv("FINALLY_SNAPSHOT_INTERVAL_SECONDS") or 30.0)
MASSIVE_POLL_SECONDS = float(os.getenv("FINALLY_MASSIVE_POLL_SECONDS") or 15.0)

# Absorbs float drift from repeated fractional-share trades (PLAN §13.8).
QUANTITY_EPSILON = 1e-6


def use_massive() -> bool:
    return bool(MASSIVE_API_KEY)
