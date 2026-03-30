# Auralyn / MedScribe — Clinical AI Triage Platform
## System Description for External Review

---

## What This System Is

A HIPAA/FDA-compliant, fully autonomous clinical AI triage platform for ENT and Flu complaints delivered over WhatsApp, Telegram, and Web. Patients interact via chat; an AI engine conducts structured intake, scores clinical risk, generates differentials, and routes to the appropriate care level. Physicians receive a structured review packet and approve or override AI decisions. The system learns from outcomes, runs multi-agent debates on hard cases, and manages its own policy evolution.

---

## Core Architecture: 9 Tiers, 66+ Layers

```
PATIENT INPUT (WhatsApp / Telegram / Web / Voice)
        ↓
CHANNEL NORMALIZER  (maps platform-specific payloads to canonical format)
        ↓
INTAKE ENGINE       (symptom extraction, modifier collection, red-flag screening)
        ↓
COMPLAINT ROUTER    (maps complaint → Pack → clinical flow)
        ↓
CLINICAL ORCHESTRATOR  ← master coordinator (server/orchestrator/clinicalOrchestrator.ts)
        ↓
 ┌──────────────────────────────────────────┐
 │         ENGINE LAYER (67+ engines)        │
 │  Scoring · Differential · Bayesian        │
 │  Medication Safety · Red Flags · Billing  │
 │  Confidence Calibration · Protocol Match  │
 └──────────────────────────────────────────┘
        ↓
SAFETY GATE         (mandatory blocker for ER_NOW / ER_URGENT decisions)
        ↓
DEBATE ENGINE       (Phase 9 — 3 agents: Bayesian, Hybrid, Safety Veto)
        ↓
FINAL DECISION      (consensus disposition + physician packet)
        ↓
OUTCOME LOGGER      (records actual vs predicted for learning loop)
        ↓
LEARNING LOOP       (RLHF, policy evolution, EMA temporal decay)
        ↓
CONTROL TOWER       (real-time operational dashboard)
```

---

## Key Directories (1,702 TypeScript files total)

| Directory | Purpose |
|---|---|
| `server/orchestrator/` | Master clinical flow coordinator |
| `server/engines/` | 67+ atomic clinical logic units |
| `server/agents/` | Agent personas (Triage, Diagnosis, Safety, Billing, Risk) |
| `server/skills/` | Reusable clinical capabilities (18 registered skills) |
| `server/phase6/` | Control Tower — real-time visibility |
| `server/phase9/` | Multi-agent debate, discovery, executive dashboard |
| `server/learning/` | RLHF, drift control, policy evolution |
| `server/safety/` | Safety gate, guardrails, red-flag detection |
| `server/audit/` | HIPAA/FDA audit log, hash chains, change impact |
| `server/testing/` | Golden case runner, simulation harness |
| `server/hardening/` | Circuit breakers, correlation IDs, request logging |
| `server/observability/` | Incident feed, traces, health alerts |
| `server/observability/intel/` | System map, orphan detection, phase registry (NEW) |

---

## Multi-Agent System (Phase 9)

Three real clinical agents debate every case independently, then reach consensus via Bayesian model averaging weighted by per-agent historical EMA accuracy (α=0.1):

- **Hybrid Reasoning Agent** — symptom clusters + protocol matching
- **Bayesian Agent** — probabilistic differential with prior updating
- **Safety Veto Agent** — hard veto power on ER_NOW/ER_URGENT calls

Disagreements emit real-time events to the Control Tower WebSocket. Outcomes feed back into per-agent accuracy weights. Policy modes (conservative/balanced/probabilistic) evolve automatically, gated by a drift circuit breaker.

---

## Clinical Flows

- **ENT Pack**: Sore throat (Centor scoring), ear pain, sinusitis
- **Flu/Upper Respiratory Pack**: Cough (cough score), fever, dizziness
- **Cardio Pack**: Chest pain (HEART-lite scoring)
- **GI Pack**: Abdominal pain, pelvic pain
- **GYN/OB Pack**: Pelvic pain, UTI
- **Specialty**: Headache, testicular pain, pediatric safety

Each pack is a structured CSV-driven decision tree loaded at runtime.

---

## Data & Integrations

- **PostgreSQL** via Drizzle ORM (primary persistence)
- **Redis / Upstash** — policy weights, debate history, agent accuracy, drift state (REST-only, TCP-limited)
- **Google Sheets** — clinical rule management, outcome sync
- **OpenAI (GPT-4.1-mini)** — LLM calls wrapped in circuit breaker
- **Twilio / WhatsApp Meta** — patient channel delivery
- **FHIR** — structured clinical data export
- **Firebase / Firestore** — optional storage driver for production scale

---

## Monitoring Surface (API Endpoints)

| Prefix | What It Covers |
|---|---|
| `/api/monitoring/*` | Circuit breakers, engine logs, SLOs, drift, snapshots |
| `/api/observability/*` | Incidents, traces, health alerts |
| `/api/phase6/control-tower` | Phase 6 system snapshot |
| `/api/phase9/*` | Debate engine, policy evolution, discovery agents |
| `/api/executive` | CEO/CTO-level health summary |
| `/api/intel/*` | System map, orphan scan, phase registry, skill status, dependency graph (NEW) |

---

## Known Architectural Gaps (Pre-Review)

1. **Engine scheduler covers 7 of 70 engine files** — 63 engines run but are not health-monitored. The new `/api/intel/engines` endpoint now exposes this gap.
2. **Agent config is in-memory only** — restarts wipe all toggle state. Redis persistence is wired but not yet activated.
3. **Skills ↔ Engine cross-reference** — 18 skills are registered; version registry covers a subset. The orphan detector now flags mismatches at `/api/intel/orphans`.
4. **Phase 7 (Learning) has no dedicated HTTP health endpoint** — drift state is exposed but there's no single `/api/phase7/health` that mirrors `/api/phase6/control-tower`.
5. **No frontend UI for the intel layer** — all 12 observability endpoints are REST-only. A dashboard page at `/intel` is the natural next step.
6. **Golden case automation** — the runner exists and is now HTTP-triggerable at `POST /api/intel/golden/run` but is not yet wired to CI/CD or a scheduled cron.

---

## Questions for External Review

1. What additional observability would you add to a 66-layer clinical AI system to make it safe to operate at scale?
2. Are there HIPAA/FDA audit patterns that are missing from the current audit layer?
3. How would you approach making 70 independent engines easier to modify without breaking downstream consumers?
4. What is the right way to handle the "agent config is in-memory" problem in a stateless container environment?
5. What patterns would you recommend for managing the drift circuit breaker's interaction with the learning loop?
6. Are there gaps in the multi-agent debate architecture that could lead to unsafe consensus decisions?
7. How would you design the rollback strategy for skills that are discovered to have degraded pass rates in production?
