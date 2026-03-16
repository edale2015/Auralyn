import { GraphGap } from "../knowledge/graphGapDetector";

export interface GapTargetCase {
  complaint: string;
  targetArea: string;
  features: Record<string, any>;
  difficulty: string;
  gapType: string;
}

export function generateGapTargetCase(gap: GraphGap): GapTargetCase {
  if (gap.problem === "missing_protocol") {
    return {
      complaint: gap.nodeLabel.toLowerCase().replace(/\s/g, "_"),
      targetArea: "protocol_coverage",
      features: {
        severity: "moderate",
        durationDays: 3,
        requiresProtocolGuidance: true,
      },
      difficulty: "moderate",
      gapType: gap.problem,
    };
  }

  if (gap.problem === "no_engine_assigned") {
    return {
      complaint: "generic",
      targetArea: `skill:${gap.nodeLabel}`,
      features: {
        edgeCase: true,
        requiresSkillExecution: true,
        skillName: gap.nodeLabel,
      },
      difficulty: "hard",
      gapType: gap.problem,
    };
  }

  if (gap.problem === "no_disposition_path") {
    return {
      complaint: "generic",
      targetArea: `diagnosis:${gap.nodeLabel}`,
      features: {
        severe: true,
        diagnosisName: gap.nodeLabel,
        requiresDispositionMapping: true,
      },
      difficulty: "hard",
      gapType: gap.problem,
    };
  }

  if (gap.problem === "missing_skill_mapping") {
    return {
      complaint: gap.nodeLabel.toLowerCase().replace(/\s/g, "_"),
      targetArea: "skill_coverage",
      features: {
        requiresSkillMapping: true,
        multipleSymptoms: true,
      },
      difficulty: "moderate",
      gapType: gap.problem,
    };
  }

  if (gap.problem === "no_questions_mapped") {
    return {
      complaint: gap.nodeLabel.toLowerCase().replace(/\s/g, "_"),
      targetArea: "question_coverage",
      features: {
        requiresScreeningQuestions: true,
      },
      difficulty: "easy",
      gapType: gap.problem,
    };
  }

  if (gap.problem === "no_diagnoses_linked") {
    return {
      complaint: gap.nodeLabel.toLowerCase().replace(/\s/g, "_"),
      targetArea: "diagnosis_coverage",
      features: {
        requiresDifferentialDiagnosis: true,
      },
      difficulty: "moderate",
      gapType: gap.problem,
    };
  }

  return {
    complaint: "generic",
    targetArea: "unknown",
    features: {},
    difficulty: "easy",
    gapType: gap.problem,
  };
}
