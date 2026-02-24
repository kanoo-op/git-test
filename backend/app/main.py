from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import settings
from .database import engine, async_session, Base
from .services.auth_service import ensure_admin_exists

from .api import auth, patients, assessments, photos, dashboard, mappings, users, audit, backup, naver
from .api import portal_auth, portal, invites, prescriptions, patient_progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + seed admin
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        await ensure_admin_exists(db)

    yield

    # Shutdown
    await engine.dispose()


limiter = Limiter(key_func=get_remote_address, default_limits=[settings.DEFAULT_RATE_LIMIT])

app = FastAPI(
    title="PostureView API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(assessments.router)
app.include_router(photos.router)
app.include_router(dashboard.router)
app.include_router(mappings.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(backup.router)
app.include_router(naver.router)
app.include_router(portal_auth.router)
app.include_router(portal.router)
app.include_router(invites.router)
app.include_router(prescriptions.router)
app.include_router(patient_progress.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
