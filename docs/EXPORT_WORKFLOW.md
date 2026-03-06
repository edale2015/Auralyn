# Export Workflow

## Current model
Exports are sidecar bundles, not direct EHR writeback.

## Export prerequisites
- case exists
- note draft exists or can be generated
- case is signed off if signoff is required
- review status is APPROVED or OVERRIDDEN

## Export outputs
Each export generates:
- encounter_export.txt
- encounter_export.json

## Export contents
- patient identifiers available in case
- complaint
- note draft
- engine recommendation
- final disposition
- red flags
- dx candidates
- reviewer summary
- signoff metadata

## Workflow
1. Physician reviews case
2. Physician signs off
3. Export panel confirms gate is open
4. User clicks export
5. Service writes export files
6. Case marked exportedToEcw=true
7. Event + runtime metric logged

## Safety notes
- No direct automatic EHR writeback in this phase
- Export bundle is for manual or assisted transfer
- Export should be reviewed before being pasted/imported into eCW
