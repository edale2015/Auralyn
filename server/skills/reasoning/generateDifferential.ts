import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable, toNumber } from "../shared/csvTableLoader";

type DifferentialItem = {
  diagnosis: string;
  confidence: number;
  supporting_findings: string[];
  contradictory_findings: string[];
};

type GenerateDifferentialResult = {
  differential_list: DifferentialItem[];
  confidence: number;
  supporting_findings: string[];
  contradictory_findings: string[];
};

function buildComplaintAliases(complaintId: string): Set<string> {
  const id = complaintId.toLowerCase();
  const aliases = new Set<string>([id]);

  const groups: string[][] = [
    ["sore_throat", "ent_sore_throat", "throat_pain", "pharyngitis"],
    ["cough", "pulm_cough", "persistent_cough"],
    ["uti", "gu_uti_symptoms", "gu_dysuria_uti", "dysuria", "urinary_symptoms"],
    ["chest_pain", "cv_chest_pain", "cardio_chest_pain"],
    ["abdominal_pain", "gi_abdominal_pain"],
    ["ear_pain", "ent_ear_pain", "otalgia"],
    ["headache", "neuro_headache"],
    ["rash", "derm_rash"],
    ["back_pain", "msk_back_pain"],
    ["diarrhea", "gi_diarrhea"],
    ["nausea", "gi_nausea_malaise", "general_nausea_malaise"],
    ["fatigue", "general_fatigue"],
  ];

  for (const group of groups) {
    if (group.some((g) => id === g || id.includes(g) || g.includes(id))) {
      for (const g of group) aliases.add(g);
    }
  }

  return aliases;
}

const CLUSTER_NAME_MAP: Record<string, string> = {
  CL_ENT_STREP_LIKE: "Streptococcal Pharyngitis",
  CL_ENT_VIRAL_PHARYNGITIS: "Viral Pharyngitis",
  CL_ENT_PTA: "Peritonsillar Abscess",
  CL_ENT_EPIGLOTTITIS_LIKE: "Epiglottitis",
  CL_ENT_MONO: "Infectious Mononucleosis",
  CL_GU_CYSTITIS: "Uncomplicated Cystitis",
  CL_GU_PYELO: "Pyelonephritis",
  CL_GU_UROSEPSIS: "Urosepsis",
  CL_GU_PREGNANCY_UTI: "UTI in Pregnancy",
  CL_GU_MALE_UTI: "Male UTI (Complicated)",
  CL_GU_IMMUNO: "UTI in Immunocompromised",
  CL_GU_RENAL_STONE: "Nephrolithiasis",
  CL_PCO_VIRAL_BRONCHITIS: "Viral Bronchitis",
  CL_PCO_PNEUMONIA: "Pneumonia",
  CL_PCO_ASTHMA_REACTIVE: "Asthma / Reactive Airway",
  CL_PCO_POSTNASAL: "Post-Nasal Drip Syndrome",
  CL_PCO_GERD_COUGH: "GERD-Related Cough",
  CL_ABD_GASTROENTERITIS: "Gastroenteritis",
  CL_ABD_APPENDICITIS: "Appendicitis",
  CL_ABD_CONSTIPATION: "Constipation",
  CL_ABD_CHOLECYSTITIS: "Cholecystitis",
};

function clusterIdToDiagnosisName(clusterId: string): string {
  if (CLUSTER_NAME_MAP[clusterId]) return CLUSTER_NAME_MAP[clusterId];

  return clusterId
    .replace(/^CL_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function baseFallbackDifferential(complaintId: string): string[] {
  const id = complaintId.toLowerCase();
  if (id.includes("sore_throat") || id.includes("ent_sore")) return ["strep_pharyngitis", "viral_pharyngitis", "mononucleosis"];
  if (id.includes("cough") || id.includes("pulm_cough") || id.includes("persistent_cough")) return ["viral_uri", "bronchitis", "pneumonia"];
  if (id.includes("uti") || id.includes("dysuria") || id.includes("urinary")) return ["cystitis", "pyelonephritis", "urethritis"];
  if (id.includes("chest_pain") || id.includes("cv_chest")) return ["musculoskeletal_pain", "gerd", "acute_coronary_syndrome"];
  if (id.includes("abdominal") || id.includes("abd")) return ["viral_gastroenteritis", "constipation", "appendicitis"];
  if (id.includes("headache")) return ["tension_headache", "migraine", "sinusitis"];
  if (id.includes("ear") || id.includes("otalgia")) return ["otitis_media", "otitis_externa", "referred_pain"];
  if (id.includes("rash") || id.includes("derm")) return ["contact_dermatitis", "viral_exanthem", "allergic_reaction"];
  return ["viral_syndrome", "bacterial_infection", "non_specific_condition"];
}

export async function generateDifferential(
  context: SkillContext
): Promise<SkillResult<GenerateDifferentialResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "generate_differential");

  const clusterScores =
    context.priorSkillOutputs?.score_differential_clusters?.result?.scored_clusters ??
    context.priorSkillOutputs?.scoreDifferentialClusters?.result?.scored_clusters ??
    [];

  const formalScore =
    context.priorSkillOutputs?.apply_clinical_score?.result ??
    context.priorSkillOutputs?.applyClinicalScore?.result ??
    null;

  let dxRows: CsvRow[] = [];
  try {
    dxRows = await loadCsvTable("DX_CANDIDATES.csv");
  } catch {
    dxRows = [];
  }

  const items: DifferentialItem[] = [];
  const complaintId = (context.complaintId ?? "").toLowerCase();
  const complaintAliases = buildComplaintAliases(complaintId);

  if (clusterScores.length) {
    const complaintDxRows = dxRows.filter((row) => {
      const ccId = getFirstValue(row, ["CC_ID", "Complaint_ID"]).toLowerCase();
      return !ccId || complaintAliases.has(ccId);
    });

    for (const cluster of clusterScores.slice(0, 6)) {
      if (cluster.score <= 0) continue;

      const clusterId = String(cluster.cluster_id).toLowerCase();

      const matchingDx = complaintDxRows.filter((row) => {
        const bestCluster = getFirstValue(row, ["BEST_CLUSTER_ID", "Cluster_ID", "Diagnosis_Cluster_ID"]);
        return bestCluster && bestCluster.toLowerCase() === clusterId;
      });

      const topDxRow = matchingDx[0];
      const clusterPriority = topDxRow ? toNumber(getFirstValue(topDxRow, ["CLUSTER_PRIORITY", "Priority"]), 50) : 50;
      const baseScore = topDxRow ? toNumber(getFirstValue(topDxRow, ["BASE_SCORE", "Base_Score"]), 0.3) : 0.3;

      const diagnosisName = clusterIdToDiagnosisName(cluster.cluster_id);
      const conf = Math.min(0.95, baseScore + Number(cluster.score || 0) / 20);

      items.push({
        diagnosis: diagnosisName,
        confidence: conf,
        supporting_findings: cluster.supporting_hits ?? [],
        contradictory_findings: [],
      });
    }
  }

  if (!items.length) {
    const fallback = baseFallbackDifferential(context.complaintId!);
    fallback.forEach((diagnosis, idx) => {
      items.push({
        diagnosis,
        confidence: Math.max(0.35, 0.75 - idx * 0.12),
        supporting_findings: [],
        contradictory_findings: [],
      });
    });
  }

  if (formalScore?.score_name === "Centor" && formalScore.score_value >= 4) {
    const strep = items.find((i) => i.diagnosis.toLowerCase().includes("strep"));
    if (strep) strep.confidence = Math.min(0.97, strep.confidence + 0.12);
  }

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = item.diagnosis.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.confidence - a.confidence);

  const supporting_findings = [...new Set(deduped.flatMap((i) => i.supporting_findings))];
  const contradictory_findings = [...new Set(deduped.flatMap((i) => i.contradictory_findings))];

  const result: SkillResult<GenerateDifferentialResult> = {
    skillId: "SK011",
    skillName: "generate_differential",
    version: "v1",
    status: "success",
    confidence: deduped[0]?.confidence ?? 0.5,
    result: {
      differential_list: deduped.slice(0, 5),
      confidence: deduped[0]?.confidence ?? 0.5,
      supporting_findings,
      contradictory_findings,
    },
    audit: {
      tablesUsed: dxRows.length
        ? ["DX_CANDIDATES", "CLUSTER_SCORING_RULES"]
        : ["DX_CANDIDATES_FALLBACK"],
      ruleHits: deduped.slice(0, 3).map((i) => i.diagnosis),
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["check_consistency_and_gaps", "determine_disposition"],
  };

  assertSkillResultShape(result, "generate_differential");
  return result;
}
