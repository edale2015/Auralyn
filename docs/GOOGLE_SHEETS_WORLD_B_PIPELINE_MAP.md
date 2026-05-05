# Google Sheets World B Clinical Reasoning Pipeline Map

This document maps Auralyn's normalized Google Sheets knowledge layer into the visible clinical pipeline. It is designed to prevent the pipeline from accidentally reading the older `kb_*` table layout while claiming to be World B.

## Current pipeline order

| Step | Pipeline stage | Canonical sources | What this stage does |
|---:|---|---|---|
| 1 | Complaint Identification | `COMPLAINT_REGISTRY` | Normalizes `complaint_id`, aliases, enabled engine, graph/version pointers, and system/category. |
| 2 | Differential Diagnosis / Rule-Out Targets | `CLUSTER_PRIMARY_DIAGNOSIS`, `GLOBAL_CLUSTER_MASTER`, `SCORING_DEFS`, `DX_CANDIDATES` | Creates the early differential immediately after chief complaint so questions and workup know what they are ruling out. |
| 3A | Modifier Collection | `MODIFIERS`, `GLOBAL_MODIFIERS`, `GLOBAL_MODIFIERS_CLEAN`, `CARDS_MODIFIER_MASTER` | Collects pregnancy, allergies, PMH, active meds, anticoagulants, immune status, cardio risk factors, and other modifiers. |
| 3B | Question Engine | `CORE_QUESTIONS`, `GLOBAL_SECONDARY` | Chooses complaint-specific and secondary questions after early differential and modifier context are known. |
| 4 | Workup Selection | `URGENT_CARE_SPOT_INTERVENTIONS` | Selects tests, vitals, imaging, point-of-care interventions, or urgent-care actions tied to the differential. |
| 5 | Medication Selection / Safety | `GLOBAL_MEDICATIONS_MASTER`, `MED_CONDITION_INTELLIGENCE_RULES` | Selects medication candidates and checks condition/medication safety rules. |
| 6 | Safety Screen (Red Flags) | `RED_FLAG_RULES`, `RED_FLAGS_MASTER` | Evaluates red flags. Even though displayed as Step 6, a hard red flag still forces escalation in the final disposition. |
| 7 | Cluster Scoring | `CLUSTER_SCORING_RULES`, `SCORING_SYSTEMS`, `SCORING_DEFS` | Scores diagnostic/evidence clusters using deterministic sheet rows. |
| 8 | Diagnosis Ranking / Differential Refinement | `CLUSTER_PRIMARY_DIAGNOSIS`, `GLOBAL_CLUSTER_MASTER`, `DX_CANDIDATES` | Refines the initial differential after modifiers, questions, workup, med-safety, red flags, and cluster evidence. |
| 9 | Disposition + Plan | `DISPOSITION_RULES`, `OUTPUT_TEMPLATES` | Merges the disposition rule with plan/rationale language. Plan is not a separate free-floating stage. |
| 13 | Audit Trail | `audit_logs`, `appendAuditEvent` | Records real encounter traces and physician actions in the tamper-evident audit chain. |

## Important clinical design notes

- Differential diagnosis must come immediately after chief complaint. Without rule-out targets, the question engine and workup stage do not know whether they are evaluating ACS, PE, pneumonia, GERD, musculoskeletal pain, panic/anxiety, or another cluster.
- Modifiers are first-class. They must not be hidden inside questions because they shape medication safety, workup choice, and differential probability.
- Workup is Step 4, medication/safety is Step 5, and red flags are Step 6 in the visible pipeline.
- Red flags are still safety-dominant. A hard red flag can force escalation at Step 9 even though the UI displays the red-flag screen at Step 6.
- Disposition and plan are merged. `DISPOSITION_RULES` chooses the care route and priority; `OUTPUT_TEMPLATES` supplies the plan/rationale text connected to that rule.
- AI can summarize or explain this trace, but it must not approve care, downgrade deterministic high/critical risk, or invent clinical rules outside the knowledge base.

## Implementation map

| Code area | File |
|---|---|
| World B sheet registration | `server/data/registry.ts` |
| World B complaint config loading | `server/services/complaintConfigLoader.ts` |
| Pipeline bundle and trace API | `server/routes/clinicalPipelineRoutes.ts` |
| Pipeline UI | `client/src/pages/ClinicalDecisionPipelinePage.tsx` |

## Runtime API shape

`GET /api/clinical-pipeline/:complaintId/bundle` returns:

```ts
{
  world: "World B — normalized Google Sheets clinical reasoning layer",
  sourceMap: PipelineSourceMapEntry[],
  layers: {
    complaintIdentification,
    differentialDiagnosis,
    modifiers,
    questions,
    workup,
    medication,
    redFlags,
    clusterScoring,
    diagnosisRanking,
    dispositionPlan,
    audit
  }
}
```

`POST /api/clinical-pipeline/:complaintId/trace` returns a stage list with the same order and step numbers.
