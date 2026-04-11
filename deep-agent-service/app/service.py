from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from .agent_factory import create_agent
from .config import WORK_DIR
from .models import DeepAgentRunRequest, DeepAgentRunResponse
from .tools import summarize_system_context


def _prepare_workspace(session_id: str, attachments: Dict[str, str], context: Dict[str, Any]) -> List[str]:
    session_root = WORK_DIR / session_id
    session_root.mkdir(parents=True, exist_ok=True)
    created: List[str] = []

    if attachments:
        for filename, content in attachments.items():
            file_path = session_root / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")
            created.append(str(file_path))

    if context:
        ctx_path = session_root / "system_context.json"
        ctx_path.write_text(json.dumps(context, indent=2), encoding="utf-8")
        created.append(str(ctx_path))

        compact_path = session_root / "system_context_compact.txt"
        compact_path.write_text(summarize_system_context(context), encoding="utf-8")
        created.append(str(compact_path))

    return created


def run_deep_agent(req: DeepAgentRunRequest) -> DeepAgentRunResponse:
    created_files = _prepare_workspace(req.session_id, req.attachments, req.context)
    agent = create_agent(req.task_type, req.session_id)

    workspace_hint = """
Workspace files were prepared in /workspace/.
Use those files when helpful.
If you generate structured recommendations, save them under /workspace/output/.
"""

    messages = [{"role": "system", "content": workspace_hint}]
    messages.extend([m.model_dump() for m in req.messages])
    messages.append({"role": "user", "content": req.user_prompt})

    result = agent.invoke({"messages": messages})

    final_text = ""
    if isinstance(result, dict):
        messages_out = result.get("messages", [])
        if messages_out:
            last = messages_out[-1]
            final_text = getattr(last, "content", "") or last.get("content", "")
    else:
        final_text = str(result)

    output_root = WORK_DIR / req.session_id / "output"
    artifacts: List[str] = []
    structured: Dict[str, Any] = {}

    if output_root.exists():
        for p in output_root.rglob("*"):
            if p.is_file():
                artifacts.append(str(p))
                if p.suffix.lower() == ".json" and not structured:
                    try:
                        structured = json.loads(p.read_text(encoding="utf-8"))
                    except Exception:
                        pass

    return DeepAgentRunResponse(
        ok=True,
        session_id=req.session_id,
        task_type=req.task_type,
        final_text=final_text,
        artifacts=created_files + artifacts,
        structured_output=structured,
        raw=result if isinstance(result, dict) else {"result": str(result)},
    )
