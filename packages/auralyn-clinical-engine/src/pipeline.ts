/**
 * pipeline.ts — Canonical 13-step clinical pipeline step definitions.
 *
 * Step order (clinically correct):
 *   1  → Complaint Identification
 *   2  → Differential Diagnosis / Rule-Out Targets
 *   3  → Modifier Collection          (3A)
 *   4  → Question Engine              (3B)
 *   5  → Workup Selection             (4)
 *   6  → Medication Selection / Safety (5)
 *   7  → Safety Screen — Red Flags    (6)  ← hard-stop decision diamond
 *   8  → Cluster Scoring              (7)
 *   9  → Diagnosis Ranking / Differential Refinement (8)
 *   10 → Disposition + Plan           (9)
 *   11 → Plan Generation
 *   13 → Audit Trail
 */

import type { PipelineStepDef } from "./types";

export const PIPELINE_STEPS: PipelineStepDef[] = [
  { step:  1,  name: "Complaint Identification",                    ruleType: null              },
  { step:  2,  name: "Differential Diagnosis / Rule-Out Targets",   ruleType: "diagnosis"       },
  { step:  3,  name: "Modifier Collection",                         ruleType: "modifier"        },
  { step:  4,  name: "Question Engine",                             ruleType: "question"        },
  { step:  5,  name: "Workup Selection",                            ruleType: "workup"          },
  { step:  6,  name: "Medication Selection / Safety",               ruleType: "medication"      },
  { step:  7,  name: "Safety Screen — Red Flags",                   ruleType: "red_flag"        },
  { step:  8,  name: "Cluster Scoring",                             ruleType: "cluster_scoring" },
  { step:  9,  name: "Diagnosis Ranking / Differential Refinement", ruleType: "diagnosis"       },
  { step: 10,  name: "Disposition + Plan",                          ruleType: "disposition"     },
  { step: 11,  name: "Plan Generation",                             ruleType: "plan"            },
  { step: 13,  name: "Audit Trail",                                 ruleType: null              },
];

/** Hard-stop escalation codes that trigger an immediate ER redirect. */
export const HARD_STOP_CODES = new Set(["ER_NOW", "ED_NOW", "CALL_911"]);

/** Step numbers that are decision nodes (diamonds) in the visual flowchart. */
export const DIAMOND_STEPS = new Set([7]);

/**
 * Returns a flat ordered list of step definitions that have associated rule types,
 * suitable for rendering a pipeline flowchart.
 */
export function getActiveSteps(): PipelineStepDef[] {
  return PIPELINE_STEPS.filter(s => s.ruleType !== null);
}
