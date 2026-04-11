from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from deepagents import create_deep_agent, Subagent
from deepagents.backends import CompositeBackend, LocalFilesystemBackend, StateBackend

from .config import MEMORY_DIR, MODEL, WORK_DIR
from .prompts import TASK_PROMPTS


def build_backend(session_id: str):
    """
    Route /memories and /workspace to local persistent folders.
    Uses filesystem-backed memory so the agent can persist useful state across runs.
    """
    session_root = WORK_DIR / session_id
    session_root.mkdir(parents=True, exist_ok=True)

    backend = CompositeBackend(
        routes={
            "/memories/": LocalFilesystemBackend(root=str(MEMORY_DIR)),
            "/workspace/": LocalFilesystemBackend(root=str(session_root)),
        },
        default=StateBackend(),
    )
    return backend


def build_subagents() -> List[Any]:
    return [
        Subagent(
            name="kb-specialist",
            system_prompt=(
                "You are a specialist in KB rows, clinical rules, complaint flows, "
                "red flags, scoring instruments, and disposition logic. "
                "Return exact KB-oriented changes."
            ),
            tools=[],
        ),
        Subagent(
            name="code-specialist",
            system_prompt=(
                "You are a specialist in implementation planning, code structure, "
                "microservices, APIs, schemas, and rollout sequencing."
            ),
            tools=[],
        ),
        Subagent(
            name="safety-specialist",
            system_prompt=(
                "You are a clinical and software safety reviewer. "
                "Focus on auditability, approval gates, safe defaults, and failure modes."
            ),
            tools=[],
        ),
        Subagent(
            name="observability-specialist",
            system_prompt=(
                "You are an observability and metrics specialist. "
                "Focus on tracing, audit logs, drift detection, and monitoring gaps."
            ),
            tools=[],
        ),
        Subagent(
            name="ehr-automation-specialist",
            system_prompt=(
                "You are an EHR automation specialist for ECW and similar systems. "
                "Focus on screen automation, selector healing, fallback logic, and safe writes."
            ),
            tools=[],
        ),
        Subagent(
            name="governance-specialist",
            system_prompt=(
                "You are a governance and compliance specialist. "
                "Focus on approval gates, audit chain, validation packs, and HIPAA/FDA impact."
            ),
            tools=[],
        ),
    ]


def create_agent(task_type: str, session_id: str, extra_tools: List[Any] | None = None):
    system_prompt = TASK_PROMPTS.get(task_type, TASK_PROMPTS["general"])
    backend = build_backend(session_id)
    tools = extra_tools or []

    agent = create_deep_agent(
        model=MODEL,
        tools=tools,
        subagents=build_subagents(),
        system_prompt=system_prompt,
        backend=backend,
        memory=["/memories/AGENTS.md"],
    )
    return agent
