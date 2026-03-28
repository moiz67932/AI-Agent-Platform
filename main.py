from __future__ import annotations

import importlib.util
import logging
import pathlib
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database.db import close_pool, init_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("platform")

load_dotenv(".env")
load_dotenv(".env.local")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Agent Platform API...")
    await init_pool()
    logger.info("Database pool initialized")
    yield
    await close_pool()
    logger.info("Database pool closed")


app = FastAPI(
    title="Agent Platform API",
    description="Multi-tenant AI voice agent deployment platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "internal server error", "detail": str(exc)},
    )


@app.get("/")
def root():
    return {"status": "ok", "service": "Agent Platform API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


_router_path = pathlib.Path(__file__).parent / "agent_platform" / "routes" / "agents.py"
spec = importlib.util.spec_from_file_location("agents_routes", _router_path)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load agents router from {_router_path}")
_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mod)
app.include_router(_mod.router)
