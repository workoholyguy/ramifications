from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# load .env from project root (one level above backend/)
ROOT_ENV = Path(__file__).resolve().parent.parent.parent / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)

from app.db import init_db
from app.routes import router as core_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    Path(__file__).resolve().parent.parent.joinpath("screenshots").mkdir(exist_ok=True)
    yield


app = FastAPI(
    title="RAMifications API",
    description="DDR5 RAM cross-retailer price tracker.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core_router)

# Swarm-friendly optional routers: Agent A writes buy_signal.py, Agent C writes affiliate.py.
# main.py is the merge boundary — neither agent edits this file, both modules auto-mount when present.
try:
    from app.buy_signal import router as buy_signal_router  # type: ignore[import-not-found]

    app.include_router(buy_signal_router)
except ImportError:
    pass

try:
    from app.affiliate import router as affiliate_router  # type: ignore[import-not-found]

    app.include_router(affiliate_router)
except ImportError:
    pass


@app.get("/")
async def root():
    return {
        "app": "RAMifications",
        "tagline": "don't suffer the consequences",
        "version": app.version,
    }


@app.get("/health")
async def health():
    return {"ok": True}
