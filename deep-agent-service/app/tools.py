from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


def write_json_artifact(path: str, payload: Dict[str, Any]) -> str:
    """Write structured JSON artifact to the agent workspace and return the path."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(p)


def summarize_system_context(context: Dict[str, Any]) -> str:
    """Compact high-level system context to help the agent reason without flooding context."""
    if not context:
        return "No additional system context supplied."

    lines: List[str] = []
    for key, value in context.items():
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value)[:3000]
        else:
            rendered = str(value)[:3000]
        lines.append(f"{key}: {rendered}")
    return "\n".join(lines)


def emit_patch_manifest(changes: List[Dict[str, Any]], output_path: str) -> str:
    """Persist a recommended patch manifest."""
    return write_json_artifact(output_path, {"changes": changes})
