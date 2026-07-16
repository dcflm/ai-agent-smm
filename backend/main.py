from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from backend.config import get_settings
from backend.api.posts import router as posts_router
from backend.api.webhooks import router as webhooks_router
from backend.api.analytics import router as analytics_router
from backend.api.chat import router as chat_router
from backend.api.knowledge_base import router as kb_router
from backend.api.schedule import router as schedule_router, load_settings, apply_schedule_to_scheduler
from backend.api.settings import router as settings_router
from backend.api.create import router as create_router
from backend.api.credits import router as credits_router
from backend.api.linkedin import router as linkedin_router
from backend.scheduler.tasks import setup_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler(app)
    # Apply saved schedule settings on startup
    try:
        apply_schedule_to_scheduler(load_settings())
    except Exception as e:
        print(f"Schedule restore warning: {e}")
    yield
    from backend.scheduler.tasks import scheduler
    if scheduler.running:
        scheduler.shutdown()


settings = get_settings()

app = FastAPI(
    title="AI Agent SMM - bizpando AG",
    description="Autonomous AI agent for LinkedIn social media management",
    version="1.0.0",
    lifespan=lifespan,
)

# Support multiple allowed origins via comma-separated FRONTEND_URL env var
# e.g. FRONTEND_URL="https://my-app.vercel.app,http://localhost:3000"
_raw_origins = settings.frontend_url or "http://localhost:3000"
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
if "http://localhost:3000" not in allowed_origins:
    allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/images", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(posts_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(kb_router, prefix="/api")
app.include_router(schedule_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(create_router, prefix="/api")
app.include_router(credits_router, prefix="/api")
app.include_router(linkedin_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "keep_alive": bool(os.environ.get("RENDER_EXTERNAL_URL"))}
