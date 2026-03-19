import { MODEL } from "./modelVersionEngine";

export interface AuditBundle {
  bundleId: string;
  caseId: string;
  modelVersion: typeof MODEL;
  trace: any;
  outcome: any;
  riskControls: any;
  timestamps: {
    created: string;
    processed: string;
  };
}

let bundleCounter = 0;

export function buildAuditBundle(caseData: {
  id?: string;
  caseId?: string;
  trace?: any;
  outcome?: any;
  riskControls?: any;
  createdAt?: string;
}): AuditBundle {
  bundleCounter++;
  return {
    bundleId: `BUNDLE-${bundleCounter.toString().padStart(6, "0")}`,
    caseId: caseData.id || caseData.caseId || `CASE-${Date.now()}`,
    modelVersion: { ...MODEL },
    trace: caseData.trace || {},
    outcome: caseData.outcome || {},
    riskControls: caseData.riskControls || {},
    timestamps: {
      created: caseData.createdAt || new Date().toISOString(),
      processed: new Date().toISOString(),
    },
  };
}
