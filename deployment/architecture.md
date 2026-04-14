# Auralyn — Production Deployment Architecture

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20 + Express 5 | TypeScript compiled |
| Database | PostgreSQL (RDS / Neon) | 75+ tables, Drizzle ORM |
| Cache | Redis (ElastiCache / Upstash) | Sessions, triage cache, BullMQ |
| AI | OpenAI GPT-4o-mini | PHI-guarded, ph-scrubbed before API calls |
| Realtime | WebSockets (ws) | Patients, control tower, EHR monitoring |
| Queue | BullMQ + Redis | Learning, audit, golden-case batch jobs |
| EHR | FHIR R4 (Athena / Epic) | SMART on FHIR OAuth2 + PKCE |
| Alerts | Twilio SMS + WhatsApp | HMAC-validated webhooks |
| Primary deploy | AWS ECS Fargate | Docker, ALB, auto-scaling |
| Fallback / edge | Fly.io | `deployment/fly.toml` |

## High-Level Architecture

```
[Patient Browser / WhatsApp / EHR]
            ↓
    [ALB / API Gateway]  ← TLS termination, WAF
            ↓
    [ECS Fargate Cluster]
      ├── Triage Engine (finalPipeline.ts)
      ├── Predictive Engine (deteriorationEngine.ts)
      ├── ICU Command Center (patientCommandCenter.ts)
      ├── FHIR Adapter (fhirClient.ts)
      ├── Autonomous Intervention Engine
      └── KB Governance Layer (kbGovernanceService.ts)
            ↓
    [PostgreSQL RDS]  ←→  [Redis ElastiCache]
            ↓
    [External Integrations]
      ├── Athena / Epic (FHIR R4)
      ├── Twilio (SMS / WhatsApp)
      ├── EMS APIs (hospital routing)
      └── OpenAI (PHI-guarded)
```

## NYC Urgent Care Pilot Targets

| Clinic | Address | Patients/Day | Pilot Start |
|---|---|---|---|
| CityMD Midtown | 787 Lexington Ave | 120 | Week 1 |
| CityMD Upper West Side | 2441 Broadway | 95 | Week 1 |
| GoHealth UES | 1492 Lexington Ave | 80 | Week 2 |
| NextCare Midtown | 205 E 42nd St | 110 | Week 3 |

**Pilot goals:** Physician handles 500+ patients/day across 4 clinics via 3-tier triage

## Rollout Plan

### Week 1 — Shadow Mode (2 clinics, 200 pts/day)
- Triage engine runs alongside existing workflow, outputs logged but not shown
- Clinical team reviews AI recommendations offline
- Target: ≥ 90% sensitivity for ER_NOW cases

### Week 2 — Assisted Mode (4 clinics, 400 pts/day)
- AI triage surfaced to physician as suggestion with explainability
- Physician approves/overrides all dispositions
- RLHF captures every override for model improvement

### Week 3-4 — Supervised Autonomy (500+ pts/day)
- Routine URGENT_CARE and HOME dispositions go straight through
- ER_NOW and ICU require physician confirmation
- Outcome tracking active

### Month 2 — Network Expansion
- Deploy to 10 additional NYC-area urgent care sites
- National routing engine connects to regional hospital network
- Payer optimization active (BCBS-NY, Aetna, Cigna, UnitedHealth)

## Payer ROI Model

| Metric | Before Auralyn | After Auralyn |
|---|---|---|
| Avg triage time | 18 min | 4 min |
| Physician capacity | 25 pts/day | 500 pts/day |
| ER unnecessary admits | 22% | 8% |
| Prior auth denial rate | 31% | 14% |
| Revenue per physician/day | ~$3,200 | ~$18,000 |
| Payer cost per patient | $285 avg | $190 avg |

**Annual ROI (4 clinic pilot):** $2.8M additional revenue + $1.1M payer savings

## Security & Compliance

- HIPAA: PHI guard on all OpenAI calls, immutable audit hash-chain, per-record HMAC
- FDA SaMD: Class II software as medical device; sensitivity ≥ 90% for ER_NOW validation
- SOC 2: Immutable audit trail, role-based access, tenant isolation verified
- SMART on FHIR: issuer allowlist, PKCE enforcement, hard-fail on auth errors
- Multi-tenant: clinicId in every cache key, JWT, and DB query; cross-tenant reads rejected

## Environment Variables Required in Production

```
DATABASE_URL          PostgreSQL connection string
REDIS_URL             Redis connection string
APP_JWT_SECRET        JWT signing secret (256-bit minimum)
AUDIT_HMAC_SECRET     Per-record audit HMAC key
OPENAI_API_KEY        OpenAI API key (PHI-guarded)
TWILIO_AUTH_TOKEN     Twilio webhook HMAC validation
FHIR_ALLOWED_ISSUERS  Comma-separated SMART issuer allowlist
FHIR_URL              FHIR R4 server base URL
INSTANCE_ID           Unique node identifier for multi-instance deployments
```
