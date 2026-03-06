# Signoff Policy

## Policy intent
The engine may recommend but does not independently finalize care.

## Required signoff
Physician signoff is required for:
- all shadow-mode clinical cases
- all exports
- all medication/order suggestions
- all moderate/high-risk complaints
- all cases with triggered red flags
- all pediatric high-risk presentations

## Signoff options
- APPROVED
- APPROVED_WITH_EDITS
- REQUEST_MORE_INFO
- ESCALATED
- REJECTED

## Required reviewer actions
Before signoff, reviewer should inspect:
- complaint
- key answers
- red flags
- note draft
- disposition recommendation
- top diagnosis candidates
- timeline if discrepancy exists

## Override guidance
Override should be used when:
- disposition unsafe/incomplete
- top diagnosis ranking is clinically misleading
- follow-up questions are still needed
- return precautions need strengthening

## Audit requirements
Every signoff must record:
- reviewer identity
- signoff status
- final disposition
- rationale
- timestamp
- engine version if available
