from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import MEMORY_DIR, MODEL, WORK_DIR
from .models import DeepAgentRunRequest, DeepAgentRunResponse, HealthResponse
from .service import run_deep_agent

app = FastAPI(title="Auralyn Deep Agent Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        model=MODEL,
        memory_dir=str(MEMORY_DIR),
        work_dir=str(WORK_DIR),
    )


@app.post("/run", response_model=DeepAgentRunResponse)
def run(req: DeepAgentRunRequest) -> DeepAgentRunResponse:
    return run_deep_agent(req)
