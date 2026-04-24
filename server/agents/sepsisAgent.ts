/**
 * server/agents/sepsisAgent.ts
 * Sepsis analysis agent.
 *
 * Runs a 8-step digital twin and a baseline-vs-intervention comparison.
 * Returns structured analysis consumed by the sepsis safety gate.
 */

import { simulateTwinV2, type TwinState } from "../twin/twinV2";
import { compareScenarios }               from "../twin/interventions";

export interface SepsisAnalysis {
  type:       "SEPSIS_ANALYSIS";
  current: {
    sofa:       number | undefined;
    sepsisProb: number | undefined;
    shock:      number | undefined;
  };
  trajectory: TwinState[];
  scenarios:  ReturnType<typeof compareScenarios>;
  flags: {
    highRisk:    boolean;
    septicShock: boolean;
  };
}

export class SepsisAgent {
  async run(patient: TwinState): Promise<SepsisAnalysis> {
    const twin = simulateTwinV2(patient, 8);
    const last = twin[twin.length - 1];
    const scenarios = compareScenarios(patient);

    return {
      type:    "SEPSIS_ANALYSIS",
      current: {
        sofa:       last.sofa,
        sepsisProb: last.sepsisProb,
        shock:      last.shock,
      },
      trajectory: twin,
      scenarios,
      flags: {
        highRisk:   (last.sepsisProb ?? 0) > 0.6,
        septicShock: (last.sepsisProb ?? 0) > 0.6 && (last.shock ?? 0) > 0.6,
      },
    };
  }
}
