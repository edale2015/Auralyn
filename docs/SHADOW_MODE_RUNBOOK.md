# Shadow Mode Runbook

## Purpose
Shadow mode allows the engine to generate recommendations, documentation drafts, and export bundles while all real clinical actions remain physician-reviewed.

## Core principles
- No autonomous final medical decisions
- No export without signoff when signoff is required
- All disagreements are logged
- All engine runs are auditable

## Daily operating flow
1. Patient completes intake in web chat or Telegram
2. Engine runs and stores recommendation
3. Case enters physician review queue
4. Physician reviews:
   - note draft
   - rule trace
   - discrepancy/timeline context
5. Physician:
   - approves
   - edits
   - requests more info
   - escalates
6. If appropriate, export sidecar bundle is generated
7. All actions are logged to Firestore and shadow-mode CSV logs

## What to monitor daily
- Review queue backlog
- Signoff turnaround time
- Disposition overrides
- Discrepancy count by complaint
- Export attempts blocked by signoff gate
- Runtime red flag frequency

## Escalation triggers
Immediately review if:
- override rate spikes for one complaint
- repeated red flag overrides occur
- export happens without expected note/signoff content
- discrepancies cluster around one diagnosis family

## Safe launch recommendation
Start with:
- limited complaint set
- shadow mode only
- clinician-only use
- no direct EHR writeback
