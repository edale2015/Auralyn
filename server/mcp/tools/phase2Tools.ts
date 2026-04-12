import { medicalMCP } from "../medicalMCP";
import { runSpecialistCouncil } from "../../services/specialistCouncilService";
import { assessMonitoring } from "../../services/patientMonitoringService";

medicalMCP.register({
  name:        "council.run",
  description: "Run cardiology + infectious disease + ICU specialist council vote",
  async execute(input) {
    const councilOpinion = runSpecialistCouncil(input);
    return {
      ...input,
      councilOpinion,
      diagnosis:   councilOpinion.consensus.diagnosis   ?? input.diagnosis,
      disposition: councilOpinion.consensus.disposition ?? input.disposition,
      riskLevel:   councilOpinion.consensus.riskLevel   ?? input.riskLevel,
      confidence:  Math.max(input.confidence ?? 0, councilOpinion.consensus.confidence),
    };
  },
});

medicalMCP.register({
  name:        "monitoring.assess",
  description: "Assess real-time deterioration risk from vitals",
  async execute(input) {
    const monitoring            = assessMonitoring(input);
    const escalatedDisposition  = monitoring.escalationRecommended ? "ED now" : input.disposition;
    return {
      ...input,
      monitoring,
      disposition: escalatedDisposition,
      riskLevel:   monitoring.escalationRecommended ? "critical" : input.riskLevel,
    };
  },
});
