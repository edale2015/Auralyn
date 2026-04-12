/**
 * Patient Chart Completeness Scanner (File System MCP equivalent)
 *
 * Article #3 (File System MCP):
 *   "With File System MCP, the AI can see your whole project.
 *   You just give it a prompt: 'Find unused components.'
 *   It scans the entire src folder. Now it understands relationships,
 *   not just snippets. It's free. Runs locally. And if you want
 *   project-level changes, this is what makes it possible."
 *
 * Clinical translation:
 *   Instead of working with isolated snippets (one vital, one lab),
 *   the scanner inspects the WHOLE patient chart and asks:
 *   "What's missing? What's contradictory? What hasn't been done?"
 *
 *   Analogous to finding "unused components" — this finds:
 *   → Missing required workup items for the presenting complaint
 *   → Contradictions (high-risk score but disposition set to discharge)
 *   → Unresolved red flags (documented but not actioned)
 *   → Documentation gaps (no allergy review, no medication reconciliation)
 *   → Time-sensitive items not yet completed (sepsis bundle items)
 *
 * Does NOT exist anywhere in the codebase — all existing tools work on
 * specific fields or specific queries, not whole-chart awareness.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PatientChart {
  patientId:       string;
  chiefComplaint:  string;
  vitals?:         ChartVitals;
  labs?:           ChartLabs;
  disposition?:    string;
  scores?:         ChartScores;
  history?:        ChartHistory;
  orders?:         ChartOrders;
  redFlags?:       string[];
  allergiesReviewed?: boolean;
  medicationsReconciled?: boolean;
  timestamp?:      string;
}

export interface ChartVitals {
  hr?: number; sbp?: number; dbp?: number; rr?: number; spo2?: number; temp?: number; gcs?: number;
}

export interface ChartLabs {
  troponin?: number; lactate?: number; wbc?: number;
  creatinine?: number; glucose?: number; dDimer?: number;
  cbc?: boolean; bmp?: boolean; bnp?: number;
}

export interface ChartScores {
  heart?: number; news2?: number; qsofa?: number; wells?: number;
  esi?: number; centor?: number; curb65?: number; gcs?: number;
}

export interface ChartHistory {
  knownAllergies?: string[];
  currentMeds?:    string[];
  pmhx?:           string[];
  lastMealTime?:   string;
  anticoagulated?: boolean;
  immunocompromised?: boolean;
  pregnant?:       boolean;
}

export interface ChartOrders {
  ecg?:          boolean;
  ctpa?:         boolean;
  xray?:         boolean;
  bloodCultures?:boolean;
  antibiotics?:  boolean;
  ivFluids?:     boolean;
  oxygen?:       boolean;
}

// ── Findings ──────────────────────────────────────────────────────────────────

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface ChartFinding {
  id:          string;
  severity:    FindingSeverity;
  category:    "missing_workup" | "contradiction" | "red_flag_unresolved" | "documentation_gap" | "time_sensitive" | "best_practice";
  description: string;
  recommendation: string;
  reference?:  string;
}

export interface ScanResult {
  patientId:    string;
  chiefComplaint:string;
  findings:     ChartFinding[];
  criticalCount:number;
  highCount:    number;
  overallRisk:  "critical" | "high" | "medium" | "low";
  completeness: number;   // 0–1: fraction of expected items present
  summary:      string;
  scannedAt:    string;
}

// ── Rule engine ───────────────────────────────────────────────────────────────

type Rule = (chart: PatientChart) => ChartFinding | null;

const UNIVERSAL_RULES: Rule[] = [
  // Documentation gaps
  (c) => !c.allergiesReviewed ? {
    id: "allergy-review", severity: "high", category: "documentation_gap",
    description: "Allergy review not documented",
    recommendation: "Complete allergy review before prescribing any medication",
    reference: "TJC NPSG 03.06.01",
  } : null,

  (c) => !c.medicationsReconciled ? {
    id: "med-reconciliation", severity: "medium", category: "documentation_gap",
    description: "Medication reconciliation not documented",
    recommendation: "Reconcile current medications — particularly anticoagulants, antihypertensives, and insulin",
  } : null,

  (c) => !c.vitals?.hr ? {
    id: "missing-hr", severity: "critical", category: "missing_workup",
    description: "Heart rate not recorded",
    recommendation: "Record complete vital signs immediately",
  } : null,

  (c) => !c.vitals?.spo2 ? {
    id: "missing-spo2", severity: "high", category: "missing_workup",
    description: "SpO2 not recorded",
    recommendation: "Pulse oximetry required for all ED presentations",
  } : null,

  // ESI scoring
  (c) => !c.scores?.esi ? {
    id: "missing-esi", severity: "medium", category: "documentation_gap",
    description: "ESI triage acuity not assigned",
    recommendation: "Assign ESI level 1–5 to all patients at triage",
    reference: "ACEP ESI v4",
  } : null,

  // Red flag resolution
  (c) => (c.redFlags?.length ?? 0) > 0 && !c.orders?.ecg ? {
    id: "red-flag-no-ecg", severity: "critical", category: "red_flag_unresolved",
    description: `Red flags documented (${c.redFlags?.join(", ")}) but ECG not ordered`,
    recommendation: "12-lead ECG within 10 minutes for any red flag presentation",
    reference: "ACEP Chest Pain Policy; AHA 2024",
  } : null,
];

const CHEST_PAIN_RULES: Rule[] = [
  (c) => !c.scores?.heart ? {
    id: "missing-heart", severity: "high", category: "missing_workup",
    description: "HEART score not calculated for chest pain presentation",
    recommendation: "Calculate HEART score — drives risk stratification and disposition",
    reference: "Backus BE et al. 2010; ACEP 2022",
  } : null,

  (c) => !c.labs?.troponin ? {
    id: "missing-troponin", severity: "high", category: "missing_workup",
    description: "Initial troponin not ordered for chest pain",
    recommendation: "Order hsTnI at 0 hours and 3 hours — mandatory for chest pain rule-out",
    reference: "ESC 2020 NSTEMI Guidelines",
  } : null,

  (c) => !c.orders?.ecg ? {
    id: "missing-ecg-cp", severity: "critical", category: "time_sensitive",
    description: "12-lead ECG not documented for chest pain",
    recommendation: "12-lead ECG within 10 minutes — AHA Class I recommendation",
    reference: "AHA/ACC 2024 STEMI Guidelines",
  } : null,

  (c) => (c.scores?.heart ?? -1) <= 3 && c.disposition === "OBSERVE" ? {
    id: "heart-low-over-obs", severity: "medium", category: "contradiction",
    description: `HEART score ${c.scores?.heart} (low risk) but disposition is OBSERVE`,
    recommendation: "HEART ≤ 3 supports discharge with outpatient follow-up — review disposition",
    reference: "Backus BE et al. — 30-day MACE < 2%",
  } : null,

  (c) => (c.scores?.heart ?? 0) >= 7 && c.disposition === "DISCHARGE" ? {
    id: "heart-high-discharge", severity: "critical", category: "contradiction",
    description: `HEART score ${c.scores?.heart} (HIGH RISK) but disposition is DISCHARGE`,
    recommendation: "HEART ≥ 7 mandates admission and cardiology consultation — change disposition immediately",
    reference: "ACEP 2022 Chest Pain Policy — HEART ≥ 7 high risk",
  } : null,
];

const SEPSIS_RULES: Rule[] = [
  (c) => !c.labs?.lactate ? {
    id: "missing-lactate", severity: "critical", category: "time_sensitive",
    description: "Lactate not ordered for sepsis presentation",
    recommendation: "Lactate must be drawn within Hour-1 bundle. Lactate ≥ 4 mmol/L triggers immediate fluid resuscitation.",
    reference: "Surviving Sepsis Campaign 2018",
  } : null,

  (c) => !c.orders?.bloodCultures ? {
    id: "missing-cultures", severity: "critical", category: "time_sensitive",
    description: "Blood cultures not ordered before antibiotics in sepsis",
    recommendation: "Draw ≥ 2 sets of blood cultures from separate sites BEFORE first antibiotic dose",
    reference: "Surviving Sepsis Hour-1 Bundle",
  } : null,

  (c) => !c.orders?.antibiotics ? {
    id: "missing-antibiotics", severity: "critical", category: "time_sensitive",
    description: "Antibiotics not ordered — each hour of delay increases mortality ~7%",
    recommendation: "Broad-spectrum antibiotics within 1 hour of sepsis recognition",
    reference: "Kumar et al. Crit Care Med 2006; Surviving Sepsis 2021",
  } : null,

  (c) => !c.orders?.ivFluids ? {
    id: "missing-fluids", severity: "high", category: "time_sensitive",
    description: "IV fluid resuscitation not initiated for sepsis",
    recommendation: "30 mL/kg crystalloid bolus for hypotension or lactate ≥ 4 mmol/L",
    reference: "Surviving Sepsis Hour-1 Bundle",
  } : null,
];

const DYSPNEA_RULES: Rule[] = [
  (c) => !c.scores?.wells ? {
    id: "missing-wells", severity: "high", category: "missing_workup",
    description: "Wells PE score not calculated for dyspnea presentation",
    recommendation: "Calculate Wells PE score — determines CTPA vs. D-dimer pathway",
    reference: "Wells et al. 2000; ACEP PE Policy 2018",
  } : null,

  (c) => !c.labs?.dDimer && (c.scores?.wells ?? 0) <= 4 ? {
    id: "missing-ddimer", severity: "high", category: "missing_workup",
    description: "D-dimer not ordered for low-probability PE (Wells ≤ 4)",
    recommendation: "D-dimer required to exclude PE when Wells score ≤ 4",
    reference: "ACEP PE Policy 2018",
  } : null,

  (c) => (c.vitals?.spo2 ?? 100) < 88 && !c.orders?.oxygen ? {
    id: "hypoxia-no-oxygen", severity: "critical", category: "red_flag_unresolved",
    description: `SpO2 ${c.vitals?.spo2}% (critically low) — supplemental oxygen not ordered`,
    recommendation: "Immediate supplemental oxygen — target SpO2 ≥ 94%. Consider high-flow or NIV.",
  } : null,
];

const COMPLAINT_RULES: Record<string, Rule[]> = {
  "chest pain":         CHEST_PAIN_RULES,
  "shortness of breath":DYSPNEA_RULES,
  "dyspnea":            DYSPNEA_RULES,
  "sepsis":             SEPSIS_RULES,
};

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Scan the whole patient chart for gaps, contradictions, and missing workup.
 * Article: "It understands relationships, not just snippets."
 */
export function scanChart(chart: PatientChart): ScanResult {
  const complaint = chart.chiefComplaint.toLowerCase();
  const findings: ChartFinding[] = [];

  // Run universal rules
  for (const rule of UNIVERSAL_RULES) {
    const finding = rule(chart);
    if (finding) findings.push(finding);
  }

  // Run complaint-specific rules
  for (const [key, rules] of Object.entries(COMPLAINT_RULES)) {
    if (complaint.includes(key)) {
      for (const rule of rules) {
        const finding = rule(chart);
        if (finding) findings.push(finding);
      }
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const unique = findings.filter((f) => seen.has(f.id) ? false : (seen.add(f.id), true));

  // Sort: critical first
  const ranked = unique.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.severity] - rank[b.severity];
  });

  const criticalCount = ranked.filter((f) => f.severity === "critical").length;
  const highCount     = ranked.filter((f) => f.severity === "high").length;
  const overallRisk   = criticalCount > 0 ? "critical" : highCount > 0 ? "high" : ranked.length > 3 ? "medium" : "low";

  // Completeness: count present expected items
  const expectedItems = getExpectedItems(complaint);
  const presentCount  = expectedItems.filter((check) => check(chart)).length;
  const completeness  = expectedItems.length > 0 ? presentCount / expectedItems.length : 1;

  return {
    patientId:      chart.patientId,
    chiefComplaint: chart.chiefComplaint,
    findings:       ranked,
    criticalCount,
    highCount,
    overallRisk,
    completeness,
    summary:        buildSummary(ranked, overallRisk, completeness),
    scannedAt:      new Date().toISOString(),
  };
}

function getExpectedItems(complaint: string): Array<(c: PatientChart) => boolean> {
  const base: Array<(c: PatientChart) => boolean> = [
    (c) => !!c.vitals?.hr,
    (c) => !!c.vitals?.spo2,
    (c) => !!c.vitals?.sbp,
    (c) => !!c.allergiesReviewed,
    (c) => !!c.scores?.esi,
  ];

  if (complaint.includes("chest pain")) base.push(
    (c) => !!c.orders?.ecg,
    (c) => !!c.labs?.troponin,
    (c) => !!c.scores?.heart,
  );

  if (complaint.includes("sepsis")) base.push(
    (c) => !!c.labs?.lactate,
    (c) => !!c.orders?.bloodCultures,
    (c) => !!c.orders?.antibiotics,
  );

  if (complaint.includes("shortness") || complaint.includes("dyspnea")) base.push(
    (c) => !!c.scores?.wells,
  );

  return base;
}

function buildSummary(findings: ChartFinding[], risk: string, completeness: number): string {
  const cnt = findings.length;
  const pct = (completeness * 100).toFixed(0);
  if (cnt === 0) return `Chart complete — no gaps detected. Completeness: ${pct}%`;
  const critical = findings.filter((f) => f.severity === "critical");
  const critStr  = critical.length > 0 ? ` CRITICAL: ${critical.map((f) => f.id).join(", ")}.` : "";
  return `${cnt} finding(s) — ${risk.toUpperCase()} overall.${critStr} Chart completeness: ${pct}%. Top action: ${findings[0]?.recommendation}`;
}

/** Format for model injection — like the File System MCP output, focused and structured. */
export function formatScanResult(result: ScanResult): string {
  if (result.findings.length === 0) {
    return `## Chart Scan — ${result.patientId} (${result.chiefComplaint})\n✓ No gaps detected. Completeness: ${(result.completeness * 100).toFixed(0)}%`;
  }

  const lines = [
    `## Chart Scan — ${result.patientId} (${result.chiefComplaint})`,
    `Completeness: ${(result.completeness * 100).toFixed(0)}% | Overall risk: ${result.overallRisk.toUpperCase()} | ${result.findings.length} finding(s)`,
    ``,
  ];

  for (const f of result.findings) {
    const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "🟢";
    lines.push(`${icon} [${f.severity.toUpperCase()}][${f.category}] ${f.description}`);
    lines.push(`  → ${f.recommendation}`);
    if (f.reference) lines.push(`  📚 ${f.reference}`);
    lines.push("");
  }

  return lines.join("\n");
}
