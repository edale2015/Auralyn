# Auralyn Clinical Intelligence Platform

A deployable clinical intelligence platform that streams patients in real-time,
predicts deterioration, prioritizes patients, suggests interventions, and learns
from outcomes.

## Quick Start

### Replit
Upload this archive → Click Run

### Docker
```
docker build -t auralyn .
docker run -p 3000:3000 auralyn
```

### Fly.io
```
fly launch
fly deploy
```

## Architecture

| Layer | File | Purpose |
|---|---|---|
| Frontend | `frontend/src/App.tsx` | React 18 + Vite scaffold |
| Backend | `backend/server.ts` | Express REST API |
| WebSocket | `backend/ws/server.ts` | Live patient stream (2s tick) |
| Deterioration | `backend/engines/deteriorationEngine.ts` | Sepsis / hypoxia risk |
| Triage | `backend/engines/triageEngine.ts` | Priority ranking |
| Interventions | `backend/engines/interventionEngine.ts` | IV fluids, labs, escalation |
| Learning | `backend/learning/rlhfEngine.ts` | RLHF weight update |
| LLM Insights | `backend/llm/insightEngine.ts` | AI clinical overlay |

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```
