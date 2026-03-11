# Skill Layer 2.0 Roadmap

## Mission
Turn the current Skill Layer into a deployable urgent care AI platform with:
- multi-site support
- governed releases
- review and reconciliation workflows
- production readiness checks
- admin operations controls

## Current state
The platform already supports:
- 18 real skills
- sequential + graph orchestration
- golden case testing
- drift alerts
- tuning suggestions
- clinician review UI
- saved cases
- outcome recording
- graph traces
- cost/latency analytics

## What Skill Layer 2.0 adds
1. Tenant/site-aware execution
2. Release gating before rollout
3. Deployment readiness checks
4. Admin review queues
5. Platform configuration registry
6. Production ops routes
7. Queue-based hardening and reconciliation workflows

## Release phases

### Phase 2.0-A: Platform Readiness
- Tenant-aware case storage
- Platform config registry
- Deployment readiness checks
- Environment validation
- Release gate scoring

### Phase 2.0-B: Clinical Ops
- Review queue
- Escalation queue
- Complaint hardening queue
- Reconciliation queue
- Callback queue dashboard

### Phase 2.0-C: Governance
- Rule ownership
- Last reviewed timestamp
- Linked complaint family
- Linked golden case coverage
- Rollback targets
- Release freeze on failed gate

### Phase 2.0-D: Deployment
- Site-by-site rollout modes
- Compare-only rollout
- Graph enablement controls
- Health check route
- Production readiness summary

### Phase 2.0-E: Learning
- Auto-generate golden cases from failures
- Reprioritize questions from outcomes
- Complaint drift alerts
- Tuning suggestions
- Complaint hardening work queue

## Release gate criteria
A complaint family can move to graph mode only if:
- golden case pass rate >= 95%
- no unresolved critical safety drift alerts
- no recent safety miss flags
- reasoning summaries present for required skills
- cost per case under configured budget
- review queue backlog below threshold

## Success metrics
- clinician minutes saved per case
- cost per case
- graph vs sequential agreement rate
- reconciliation match rate
- safety miss rate
- complaint hardening throughput
