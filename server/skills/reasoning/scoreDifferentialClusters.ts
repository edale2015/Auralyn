import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable, toNumber } from "../shared/csvTableLoader";

type ScoredCluster = {
  cluster_id: string;
  cluster_name: string;
  score: number;
  supporting_hits: string[];
};

type ScoreDifferentialClustersResult = {
  scored_clusters: ScoredCluster[];
  trigger_hits: string[];
  missing_discriminators: string[];
};

function getFactBag(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.priorSkillOutputs?.normalizePatientStory?.result?.structured_facts ??
    context.knownFacts ??
    {}
  );
}

function buildSyntheticAnswers(facts: Record<string, any>, rawText: string): Record<string, string> {
  const answers: Record<string, string> = {};
  const lower = rawText.toLowerCase();

  const factToQuestionMap: Record<string, string[]> = {
    fever_present: ["FEVER", "FVR", "ST_FEVER", "PCO_FEVER", "UTI_FEVER", "ABD_FEVER", "CP_FEVER", "AR_FEVER", "AMS_FEVER", "BKPN_FEVER"],
    cough_present: ["COUGH", "C_COUGH", "ST_COUGH", "PCO_COUGH"],
    sore_throat_present: ["ST_PAIN", "THROAT_PAIN"],
    sob_present: ["SOB", "PCO_SOB", "CP_SOB", "AR_SOB", "ST_SOB"],
    chest_pain_present: ["CP", "CHEST_PAIN", "PCO_CP", "CP_PAIN"],
    dysuria_present: ["UTI_DYSURIA", "DYSURIA"],
    urinary_frequency_present: ["UTI_FREQUENCY", "FREQUENCY"],
    abdominal_pain_present: ["ABD_PAIN", "ABD_LOC"],
    rash_present: ["RASH", "DERM_RASH"],
    confusion_present: ["CONFUSION", "UTI_CONFUSION", "AMS_SUDDEN"],
    nausea_present: ["NAUSEA", "UTI_NAUSEA", "ABD_NAUSEA"],
    vomiting_present: ["VOMITING", "UTI_VOMITING", "ABD_VOMIT"],
  };

  for (const [factKey, qSuffixes] of Object.entries(factToQuestionMap)) {
    const val = facts[factKey] === true ? "yes" : facts[factKey] === false ? "no" : undefined;
    if (val) {
      for (const suffix of qSuffixes) {
        answers[suffix] = val;
      }
    }
  }

  const textTerms: Record<string, string[]> = {
    yes: [
      "wheeze", "wheezing", "tender nodes", "lymph node", "exudate",
      "tonsillar", "flank pain", "chills", "night sweats", "weight loss",
      "heartburn", "acid reflux", "drooling", "stridor", "trismus",
      "hot potato", "blood", "hemoptysis", "post-nasal", "postnasal",
      "urgency", "weakness", "pregnant", "pregnancy",
    ],
  };

  const termToQuestion: Record<string, string[]> = {
    wheeze: ["PCO_WHEEZE", "AR_WHEEZE"],
    wheezing: ["PCO_WHEEZE", "AR_WHEEZE"],
    "tender nodes": ["ST_NODES"],
    "lymph node": ["ST_NODES"],
    exudate: ["ST_EXUDATE"],
    tonsillar: ["ST_EXUDATE"],
    "flank pain": ["UTI_FLANK_PAIN"],
    chills: ["UTI_CHILLS", "CHILLS"],
    "night sweats": ["PCO_NIGHT", "NIGHT_SWEATS"],
    heartburn: ["PCO_HEARTBURN"],
    "acid reflux": ["PCO_HEARTBURN"],
    drooling: ["ST_DROOL"],
    stridor: ["ST_STRIDOR"],
    trismus: ["ST_TRISMUS"],
    "hot potato": ["ST_HOTPOTATO"],
    blood: ["PCO_BLOOD"],
    hemoptysis: ["PCO_BLOOD"],
    "post-nasal": ["PCO_PND"],
    postnasal: ["PCO_PND"],
    urgency: ["UTI_URGENCY", "URGENCY"],
    weakness: ["UTI_WEAKNESS", "WEAKNESS"],
    pregnant: ["UTI_PREGNANT", "PREGNANT"],
    pregnancy: ["UTI_PREGNANT", "PREGNANT"],
  };

  for (const term of textTerms.yes) {
    const negated = lower.includes(`no ${term}`) || lower.includes(`denies ${term}`);
    const present = lower.includes(term);
    if (present) {
      const qKeys = termToQuestion[term] ?? [];
      for (const qk of qKeys) {
        answers[qk] = negated ? "no" : "yes";
      }
    }
  }

  if (facts.age != null) {
    answers["AGE"] = String(facts.age);
  }
  if (facts.duration) {
    const dMatch = String(facts.duration).match(/(\d+)/);
    if (dMatch) {
      answers["DUR"] = dMatch[1];
      answers["PCO_DUR"] = dMatch[1];
      answers["ST_DUR"] = dMatch[1];
    }
  }
  if (facts.sex) {
    answers["UTI_MALE"] = facts.sex === "male" ? "yes" : "no";
  }

  return answers;
}

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

function evaluateWhenExpr(expr: string, syntheticAnswers: Record<string, string>): boolean | null {
  if (!expr || !expr.trim()) return null;

  const orParts = expr.split("||").map((s) => s.trim());

  for (const part of orParts) {
    const andParts = part.split("&&").map((s) => s.trim());
    let allTrue = true;

    for (const clause of andParts) {
      const eqMatch = clause.match(/answers\.Q_(\w+)\s*==\s*'([^']*)'/);
      const neqMatch = clause.match(/answers\.Q_(\w+)\s*!=\s*'([^']*)'/);
      const lteMatch = clause.match(/answers\.Q_(\w+)\s*<=\s*(\d+)/);
      const gteMatch = clause.match(/answers\.Q_(\w+)\s*>=\s*(\d+)/);
      const ltMatch = clause.match(/answers\.Q_(\w+)\s*<\s*(\d+)/);
      const gtMatch = clause.match(/answers\.Q_(\w+)\s*>\s*(\d+)/);

      if (eqMatch) {
        const [, key, expected] = eqMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (actual !== expected) { allTrue = false; break; }
      } else if (neqMatch) {
        const [, key, expected] = neqMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (actual === expected) { allTrue = false; break; }
      } else if (lteMatch) {
        const [, key, threshold] = lteMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (Number(actual) > Number(threshold)) { allTrue = false; break; }
      } else if (gteMatch) {
        const [, key, threshold] = gteMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (Number(actual) < Number(threshold)) { allTrue = false; break; }
      } else if (ltMatch) {
        const [, key, threshold] = ltMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (Number(actual) >= Number(threshold)) { allTrue = false; break; }
      } else if (gtMatch) {
        const [, key, threshold] = gtMatch;
        const actual = syntheticAnswers[key];
        if (actual === undefined) { allTrue = false; break; }
        if (Number(actual) <= Number(threshold)) { allTrue = false; break; }
      } else {
        allTrue = false;
        break;
      }
    }

    if (allTrue) return true;
  }

  return false;
}

export async function scoreDifferentialClusters(
  context: SkillContext
): Promise<SkillResult<ScoreDifferentialClustersResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "score_differential_clusters");

  let rows: CsvRow[] = [];
  try {
    rows = await loadCsvTable("CLUSTER_SCORING_RULES.csv");
  } catch {
    rows = [];
  }

  const facts = getFactBag(context);
  const rawText = [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ].join(" ");

  const syntheticAnswers = buildSyntheticAnswers(facts, rawText);

  const complaintAliases = buildComplaintAliases(context.complaintId!);

  const matchingRows = rows.filter((row) => {
    const cid = getFirstValue(row, ["CC_ID", "Complaint_ID", "Complaint"]).toLowerCase();
    return !cid || complaintAliases.has(cid);
  });

  const clusterMap = new Map<string, ScoredCluster>();
  const evaluatedCount = { total: 0, matched: 0, unevaluable: 0 };

  for (const row of matchingRows) {
    evaluatedCount.total++;

    const cluster_id =
      getFirstValue(row, ["CLUSTER_ID", "Cluster_ID", "Diagnosis_Cluster_ID"]) || "UNKNOWN_CLUSTER";
    const evidenceLabel =
      getFirstValue(row, ["EVIDENCE_LABEL", "Evidence_Label", "Label"]) || cluster_id;

    const whenExpr = getFirstValue(row, ["WHEN_EXPR", "When_Expr", "Condition", "Trigger"]) || "";
    const points = toNumber(getFirstValue(row, ["POINTS", "Points", "Weight", "Score"]), 1);

    const evalResult = evaluateWhenExpr(whenExpr, syntheticAnswers);

    if (evalResult === null) {
      evaluatedCount.unevaluable++;
      continue;
    }
    if (!evalResult) continue;

    evaluatedCount.matched++;

    const current = clusterMap.get(cluster_id) ?? {
      cluster_id,
      cluster_name: cluster_id.replace(/^CL_/, "").replace(/_/g, " "),
      score: 0,
      supporting_hits: [],
    };

    current.score += points;
    current.supporting_hits.push(evidenceLabel);
    clusterMap.set(cluster_id, current);
  }

  const scored_clusters = [...clusterMap.values()].sort((a, b) => b.score - a.score);
  const trigger_hits = scored_clusters.flatMap((c) => c.supporting_hits);

  const missing_discriminators: string[] = [];
  if (scored_clusters.length === 0) missing_discriminators.push("no_cluster_rules_matched");
  if (evaluatedCount.unevaluable > matchingRows.length * 0.5)
    missing_discriminators.push("many_unevaluable_expressions");

  const result: SkillResult<ScoreDifferentialClustersResult> = {
    skillId: "SK012",
    skillName: "score_differential_clusters",
    version: "v1",
    status: scored_clusters.length ? "success" : "partial",
    confidence: scored_clusters.length ? 0.88 : 0.45,
    result: {
      scored_clusters,
      trigger_hits,
      missing_discriminators,
    },
    audit: {
      tablesUsed: rows.length ? ["CLUSTER_SCORING_RULES"] : ["CLUSTER_SCORING_RULES_MISSING"],
      ruleHits: trigger_hits,
      missingData: missing_discriminators,
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["apply_clinical_score", "generate_differential"],
  };

  assertSkillResultShape(result, "score_differential_clusters");
  return result;
}
