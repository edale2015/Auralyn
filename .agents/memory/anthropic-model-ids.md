---
name: Anthropic model IDs
description: Current valid Anthropic model IDs as of June 2026; older -20250514 sonnet/haiku IDs are deprecated.
---

## Current valid model IDs
- **Claude Sonnet** (mid-tier, non-clinical): `claude-sonnet-4-6`
- **Claude Haiku** (fast/cheap, non-clinical): `claude-haiku-4-6`
- **Claude Opus** (clinical brain, pinned): `claude-opus-4-20250514` — still valid as of June 2026

**Why:** `claude-sonnet-4-20250514` and `claude-haiku-4-20250514` reached end-of-life June 15, 2026. They return 404 from the Anthropic API, causing LLM gateway failover on every self-healing/inference call.

**How to apply:** Use `claude-sonnet-4-6` for any new Anthropic sonnet references in `llmGateway.ts`, `modelRouter.ts`, `providerDiversity.ts`. Verify the streaming agent (`server/whatsapp/agent/streamingAgent.ts`) — it already uses `claude-sonnet-4-6` as the reference.
