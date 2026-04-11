from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


AgentTaskType = Literal[
    "research",
    "kb_audit",
    "code_review",
    "workflow_upgrade",
    "article_compare",
    "general",
]


class MessageIn(BaseModel):
    role: Literal["user", "system", "assistant"]
    content: str


class DeepAgentRunRequest(BaseModel):
    session_id: str = Field(..., description="Stable session/thread id")
    task_type: AgentTaskType = "general"
    user_prompt: str
    messages: List[MessageIn] = Field(default_factory=list)
    attachments: Dict[str, str] = Field(default_factory=dict, description="filename -> content")
    context: Dict[str, Any] = Field(default_factory=dict)
    write_artifacts: bool = True


class DeepAgentRunResponse(BaseModel):
    ok: bool
    session_id: str
    task_type: AgentTaskType
    final_text: str
    artifacts: List[str] = Field(default_factory=list)
    structured_output: Dict[str, Any] = Field(default_factory=dict)
    raw: Dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    ok: bool
    model: str
    memory_dir: str
    work_dir: str
