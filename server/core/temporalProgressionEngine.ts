export type TemporalInput = {
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions?: Record<string, any>;
};

export type TemporalSignal = {
  label: string;
  weight: number;
  reason: string;
  diagnoses?: string[];
};

export type TemporalOutput = {
  onsetCategory: "hyperacute" | "acute" | "subacute" | "chronic" | "unknown";
  trajectory: "improving" | "stable" | "worsening" | "fluctuating" | "unknown";
  temporalSignals: TemporalSignal[];
  diagnosisBoosts: Record<string, number>;
  warnings: string[];
};

function hoursFromAnswers(a: Record<string, any>): number | null {
  const h = a.duration_hours;
  const d = a.duration_days;
  const w = a.duration_weeks;

  if (typeof h === "number") return h;
  if (typeof d === "number") return d * 24;
  if (typeof w === "number") return w * 24 * 7;

  const duration = String(a.duration || "").toLowerCase();
  if (!duration) return null;

  if (duration.includes("hour")) {
    const n = Number(duration.match(/\d+/)?.[0] || "");
    return Number.isFinite(n) ? n : null;
  }
  if (duration.includes("day")) {
    const n = Number(duration.match(/\d+/)?.[0] || "");
    return Number.isFinite(n) ? n * 24 : null;
  }
  if (duration.includes("week")) {
    const n = Number(duration.match(/\d+/)?.[0] || "");
    return Number.isFinite(n) ? n * 24 * 7 : null;
  }

  return null;
}

function addBoost(map: Record<string, number>, dxs: string[], weight: number) {
  for (const dx of dxs) {
    map[dx] = (map[dx] || 0) + weight;
  }
}

export function temporalProgressionEngine(input: TemporalInput): TemporalOutput {
  const a = input.answeredQuestions || {};
  const temporalSignals: TemporalSignal[] = [];
  const diagnosisBoosts: Record<string, number> = {};
  const warnings: string[] = [];

  const hours       = hoursFromAnswers(a);
  const worsening   = !!a.worsening   || String(a.course || "").toLowerCase().includes("worsen");
  const improving   = !!a.improving   || String(a.course || "").toLowerCase().includes("improv");
  const sudden      = !!a.sudden_onset || input.normalizedSymptoms.includes("sudden_onset");
  const gradual     = !!a.gradual_onset || input.normalizedSymptoms.includes("gradual_onset");
  const intermittent = !!a.intermittent || String(a.course || "").toLowerCase().includes("intermittent");

  // ── Onset categorisation ──────────────────────────────────────────────────
  let onsetCategory: TemporalOutput["onsetCategory"] = "unknown";
  if (hours != null) {
    if (hours <= 6)            onsetCategory = "hyperacute";
    else if (hours <= 72)      onsetCategory = "acute";
    else if (hours <= 24 * 28) onsetCategory = "subacute";
    else                       onsetCategory = "chronic";
  }

  // ── Trajectory ────────────────────────────────────────────────────────────
  let trajectory: TemporalOutput["trajectory"] = "unknown";
  if (worsening)        trajectory = "worsening";
  else if (improving)   trajectory = "improving";
  else if (intermittent) trajectory = "fluctuating";
  else if (hours != null) trajectory = "stable";

  // ── Complaint-specific temporal signals ───────────────────────────────────

  // Headache — thunderclap / hyperacute
  if (input.complaint === "headache" && (sudden || onsetCategory === "hyperacute")) {
    temporalSignals.push({
      label: "hyperacute_headache",
      weight: 1.0,
      reason: "Sudden or hyperacute headache onset",
      diagnoses: ["subarachnoid_hemorrhage", "stroke", "meningitis"],
    });
    addBoost(diagnosisBoosts, ["subarachnoid_hemorrhage", "stroke", "meningitis"], 1.0);
  }

  // Chest pain / SOB — sudden onset
  if (
    (input.complaint === "chest_pain" || input.complaint === "shortness_of_breath") &&
    sudden
  ) {
    temporalSignals.push({
      label: "sudden_cardiopulmonary_onset",
      weight: 0.9,
      reason: "Sudden onset cardiopulmonary symptoms",
      diagnoses: ["pulmonary_embolism", "pneumothorax", "acute_coronary_syndrome", "aortic_dissection"],
    });
    addBoost(diagnosisBoosts, ["pulmonary_embolism", "pneumothorax", "acute_coronary_syndrome", "aortic_dissection"], 0.9);
  }

  // URI / sinus / cough — prolonged course
  if (
    ["cough", "sinus_pressure", "sore_throat"].includes(input.complaint) &&
    hours != null && hours > 24 * 14
  ) {
    temporalSignals.push({
      label: "prolonged_upper_respiratory_course",
      weight: 0.6,
      reason: "Prolonged upper respiratory symptoms",
      diagnoses: ["bacterial_sinusitis", "post_viral_cough", "asthma", "allergic_rhinitis"],
    });
    addBoost(diagnosisBoosts, ["bacterial_sinusitis", "post_viral_cough", "asthma", "allergic_rhinitis"], 0.6);
  }

  // Dysuria — worsening progressive
  if (input.complaint === "dysuria" && worsening && hours != null && hours > 24) {
    temporalSignals.push({
      label: "progressive_urinary_course",
      weight: 0.7,
      reason: "Urinary symptoms worsening over >24h",
      diagnoses: ["uti", "pyelonephritis", "prostatitis"],
    });
    addBoost(diagnosisBoosts, ["uti", "pyelonephritis", "prostatitis"], 0.7);
  }

  // Abdominal pain — worsening
  if (input.complaint === "abdominal_pain" && worsening) {
    temporalSignals.push({
      label: "worsening_abdominal_pain",
      weight: 0.8,
      reason: "Worsening abdominal pain raises concern for surgical pathology",
      diagnoses: ["appendicitis", "bowel_obstruction", "ectopic_pregnancy", "ovarian_torsion"],
    });
    addBoost(diagnosisBoosts, ["appendicitis", "bowel_obstruction", "ectopic_pregnancy", "ovarian_torsion"], 0.8);
  }

  // Ear pain — chronic without improvement
  if (input.complaint === "earache" && hours != null && hours > 24 * 7 && !improving) {
    temporalSignals.push({
      label: "persistent_ear_pain",
      weight: 0.5,
      reason: "Ear pain persisting > 1 week without improvement",
      diagnoses: ["chronic_otitis_media", "malignant_otitis_externa", "cholesteatoma"],
    });
    addBoost(diagnosisBoosts, ["chronic_otitis_media", "malignant_otitis_externa", "cholesteatoma"], 0.5);
  }

  // Back pain — acute worsening (cauda equina risk)
  if (input.complaint === "back_pain" && worsening && onsetCategory === "acute") {
    temporalSignals.push({
      label: "acute_worsening_back_pain",
      weight: 0.7,
      reason: "Acute worsening back pain — cauda equina and cord compression must be excluded",
      diagnoses: ["cauda_equina_syndrome", "epidural_abscess", "vertebral_fracture"],
    });
    addBoost(diagnosisBoosts, ["cauda_equina_syndrome", "epidural_abscess", "vertebral_fracture"], 0.7);
  }

  // ── Logical conflicts ─────────────────────────────────────────────────────
  if (sudden && gradual)      warnings.push("Both sudden and gradual onset reported");
  if (improving && worsening) warnings.push("Both improving and worsening trajectory reported");

  return { onsetCategory, trajectory, temporalSignals, diagnosisBoosts, warnings };
}
