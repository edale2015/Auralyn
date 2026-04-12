import { fdaValidationService } from "./fdaValidationService";
import { driftDetectionService } from "./driftDetectionService";
import { goldenCaseService } from "./goldenCaseService";
import { auditHashChain } from "./hashChain";

export interface SaMDDossier {
  deviceName:          string;
  classification:      string;
  intendedUse:         string;
  softwareVersion:     string;
  systemArchitecture:  Record<string, boolean>;
  validation:          ReturnType<typeof fdaValidationService.generateReport>;
  drift:               ReturnType<typeof driftDetectionService.detect>;
  riskAnalysis:        { mitigations: string[] };
  audit:               { hashChainEnabled: boolean; chainLength: number; chainValid: boolean; traceLogging: boolean };
  goldenCaseCorpus:    { totalCases: number; activeCases: number };
  generatedAt:         string;
}

class SaMDDossierService {
  generate(): SaMDDossier {
    const runs       = goldenCaseService.listRuns();
    const validation = fdaValidationService.generateReport(runs);
    const drift      = driftDetectionService.detect();

    return {
      deviceName:         "Auralyn MedOS",
      classification:     "SaMD Class II",
      intendedUse:        "Clinical decision support for urgent care triage",
      softwareVersion:    "3.0.0",

      systemArchitecture: {
        mcpLayer:          true,
        bayesianEngine:    true,
        specialistCouncil: true,
        realTimeMonitoring:true,
        rlhfLearningLoop:  true,
        goldenCaseHarness: true,
        immutableAuditChain:true,
      },

      validation,
      drift,

      riskAnalysis: {
        mitigations: [
          "Physician override required before finalising disposition",
          "Confidence thresholds gate autonomous recommendations",
          "Hard red-flag escalation rules override all model outputs",
          "Specialist council consensus required for ED-now dispositions",
          "RLHF learning loop capped at ±2% weight delta per proposal",
        ],
      },

      audit: {
        hashChainEnabled: true,
        chainLength:      auditHashChain.length(),
        chainValid:       auditHashChain.verify(),
        traceLogging:     true,
      },

      goldenCaseCorpus: {
        totalCases:  goldenCaseService.list(false).length,
        activeCases: goldenCaseService.list(true).length,
      },

      generatedAt: new Date().toISOString(),
    };
  }
}

export const samdDossierService = new SaMDDossierService();
