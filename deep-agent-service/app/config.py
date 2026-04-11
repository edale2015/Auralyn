from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("DEEP_AGENT_MODEL", "openai:gpt-5.4")
MEMORY_DIR = Path(os.getenv("DEEP_AGENT_MEMORY_DIR", "./data/memory")).resolve()
WORK_DIR = Path(os.getenv("DEEP_AGENT_WORK_DIR", "./data/work")).resolve()

MEMORY_DIR.mkdir(parents=True, exist_ok=True)
WORK_DIR.mkdir(parents=True, exist_ok=True)
