/**
 * Precision Clinical Guideline Lookup (Ref MCP equivalent)
 *
 * Article #4 (Ref MCP):
 *   "It lets the AI ask the documentation a very specific question.
 *   Instead of: 'Read the Playwright docs'
 *   Your prompt would be: 'What are the parameters for page.waitForSelector?'
 *   It returns only that function, just the signature, just the explanation.
 *   No extra noise. If you use large libraries, this keeps your AI focused."
 *
 * Clinical translation:
 *   Instead of: "Give me the chest pain guidelines"
 *   Ask: "What is the HEART score threshold for safe discharge?"
 *   Returns: ONLY the HEART score ≤ 3 = low risk = 30-day MACE < 2% information.
 *
 * The existing knowledgeGraphQueryEngine does broad neighborhood traversal.
 * This module does narrow, precision Q&A against clinical knowledge:
 *   - Scored thresholds (HEART ≤ 3, NEWS2 ≥ 5, qSOFA ≥ 2)
 *   - First-line treatments by condition
 *   - Contraindications for medications in specific contexts
 *   - Mandatory bundles (Sepsis Hour-1, STEMI door-to-balloon)
 *   - ACEP evidence levels (Level A/B/C recommendations)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvidenceLevel = "A" | "B" | "C" | "expert_consensus";

export interface GuidelineEntry {
  id:            string;
  question:      string;    // the question this entry answers
  answer:        string;    // the precise, minimal answer
  source:        string;    // e.g. "ACEP 2025 Chest Pain Policy", "Surviving Sepsis 2024"
  evidenceLevel: EvidenceLevel;
  tags:          string[];  // for lookup: ["heart_score", "chest_pain", "discharge"]
  numerics?:     Record<string, number | string>;  // scored values, thresholds
  lastUpdated:   string;
}

export interface LookupResult {
  question:   string;
  matched:    GuidelineEntry[];
  topAnswer:  GuidelineEntry | null;
  confidence: number;    // 0–1: how well the question matched
  noiseRatio: number;    // fraction of KB entries skipped (high = focused response)
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

const _kb: GuidelineEntry[] = [
  // ── Chest Pain / HEART Score ─────────────────────────────────────────────
  { id: "heart-threshold", question: "What is the HEART score threshold for safe discharge?", answer: "HEART score ≤ 3 (low risk) is associated with a 30-day MACE rate < 2% and supports safe discharge with outpatient follow-up. HEART 4–6 = intermediate risk (observation recommended). HEART ≥ 7 = high risk (admission/intervention).", source: "Backus BE et al. 2010; ACEP 2022 Chest Pain Policy", evidenceLevel: "A", tags: ["heart_score", "chest_pain", "discharge", "risk_stratification"], numerics: { low_threshold: 3, high_threshold: 7, mace_rate_low: 0.02 }, lastUpdated: "2024-01" },
  { id: "stemi-door-balloon", question: "What is the door-to-balloon time target for STEMI?", answer: "Door-to-balloon (D2B) time target is ≤ 90 minutes from first medical contact for primary PCI. If transfer is required, ≤ 120 minutes total. Fibrinolysis if PCI unavailable within 120 minutes.", source: "ACC/AHA 2024 STEMI Guidelines", evidenceLevel: "A", tags: ["stemi", "pci", "chest_pain", "time_target"], numerics: { d2b_minutes: 90, transfer_minutes: 120 }, lastUpdated: "2024-01" },
  { id: "troponin-delta", question: "What troponin rise constitutes a positive result on 0/3-hour protocol?", answer: "On the 0/3-hour protocol: an absolute rise in high-sensitivity troponin (hsTnI) > 6 ng/L between 0h and 3h constitutes a positive result. The 0/1-hour ESC protocol uses site-specific delta values.", source: "ESC 2020 NSTEMI Guidelines; ACC 2022", evidenceLevel: "A", tags: ["troponin", "delta", "chest_pain", "labs"], numerics: { min_rise_ngL: 6, protocol_hours: 3 }, lastUpdated: "2024-01" },

  // ── Sepsis ───────────────────────────────────────────────────────────────
  { id: "sepsis-hour1-bundle", question: "What is the sepsis Hour-1 bundle?", answer: "Surviving Sepsis Hour-1 Bundle (2018): (1) Measure lactate. (2) Blood cultures before antibiotics. (3) Broad-spectrum antibiotics within 1 hour of recognition. (4) 30 mL/kg crystalloid for hypotension or lactate ≥ 4 mmol/L. (5) Vasopressors if hypotensive during/after fluids (MAP target ≥ 65 mmHg).", source: "Surviving Sepsis Campaign 2018; Levy et al.", evidenceLevel: "A", tags: ["sepsis", "bundle", "hour1", "antibiotics", "fluids"], numerics: { fluid_mL_per_kg: 30, lactate_threshold: 4, map_target: 65 }, lastUpdated: "2024-01" },
  { id: "qsofa-threshold", question: "What qSOFA score suggests sepsis-3 criteria are met?", answer: "qSOFA ≥ 2 out of 3 criteria suggests organ dysfunction risk and should prompt full SOFA evaluation. Criteria: Respiratory rate ≥ 22/min (1 point), altered mentation (1 point), systolic BP ≤ 100 mmHg (1 point).", source: "Sepsis-3 Consensus 2016 (Singer et al., JAMA)", evidenceLevel: "A", tags: ["qsofa", "sepsis", "screening"], numerics: { positive_threshold: 2, rr_threshold: 22, sbp_threshold: 100 }, lastUpdated: "2024-01" },
  { id: "antibiotic-timing", question: "When must antibiotics be given in septic shock?", answer: "Antibiotics must be administered within 1 hour of septic shock recognition. Each hour of delay in antibiotic administration is associated with a 7% increase in mortality (Kumar et al., Crit Care Med 2006).", source: "Surviving Sepsis 2021; Kumar et al. 2006", evidenceLevel: "A", tags: ["antibiotics", "sepsis", "timing", "mortality"], numerics: { hour_limit: 1, mortality_increase_per_hour_pct: 7 }, lastUpdated: "2024-01" },

  // ── NEWS2 ────────────────────────────────────────────────────────────────
  { id: "news2-escalation", question: "At what NEWS2 score should a physician be called?", answer: "NEWS2 ≥ 5 triggers urgent physician review (within 30 minutes). NEWS2 ≥ 7 requires continuous monitoring and consideration of ICU transfer. A single extreme parameter score of 3 also mandates immediate review regardless of total.", source: "Royal College of Physicians NEWS2 2017", evidenceLevel: "A", tags: ["news2", "escalation", "threshold"], numerics: { urgent_threshold: 5, icu_threshold: 7, single_extreme: 3 }, lastUpdated: "2024-01" },

  // ── Pulmonary Embolism ───────────────────────────────────────────────────
  { id: "wells-pe", question: "What Wells score is clinically likely for PE?", answer: "Wells score > 4 = PE clinically likely (sensitivity 85%, specificity 51%). Score ≤ 4 = PE unlikely — use D-dimer. If PE likely: proceed directly to CT-PA. D-dimer threshold: ≥ 500 μg/L (or age-adjusted = age × 10 if > 50 years).", source: "Wells et al. 2000; ACEP PE Policy 2018", evidenceLevel: "A", tags: ["wells", "pe", "pulmonary_embolism", "d_dimer"], numerics: { likely_threshold: 4, d_dimer_threshold: 500 }, lastUpdated: "2024-01" },

  // ── Antibiotic Stewardship ───────────────────────────────────────────────
  { id: "strep-centor", question: "At what Centor score is strep throat antibiotic treatment indicated?", answer: "Centor score ≥ 3 warrants rapid strep test. Centor ≥ 4 supports empiric antibiotic treatment if RADT unavailable. First-line: amoxicillin 500 mg BID × 10 days (or penicillin V). Azithromycin if penicillin-allergic. Centor ≤ 2: antibiotic not indicated.", source: "IDSA Strep Guidelines 2012; Centor et al. 1981", evidenceLevel: "A", tags: ["strep", "centor", "antibiotic", "pharyngitis"], numerics: { test_threshold: 3, empiric_threshold: 4 }, lastUpdated: "2024-01" },
  { id: "uti-uncomplicated", question: "What is first-line treatment for uncomplicated UTI in women?", answer: "First-line: Nitrofurantoin 100 mg BID × 5 days (avoid if eGFR < 45). Alternatively: trimethoprim-sulfamethoxazole 160/800 mg BID × 3 days (if local resistance < 20%). Fosfomycin 3g single dose. Fluoroquinolones are not recommended as first-line due to resistance concerns.", source: "IDSA UTI Guidelines 2011 (updated 2022); ACEP AUM Policy", evidenceLevel: "A", tags: ["uti", "antibiotic", "nitrofurantoin", "first_line"], lastUpdated: "2024-01" },

  // ── Disposition thresholds ───────────────────────────────────────────────
  { id: "esi-1-criteria", question: "What criteria define an ESI 1 (immediate) triage patient?", answer: "ESI Level 1 (Immediate): Patient requires immediate life-saving intervention. Criteria: cardiac/respiratory arrest, intubation required, respiratory failure (SpO2 < 88% on room air), hemodynamic instability (SBP < 80 unresponsive), active seizure, major trauma with altered LOC.", source: "ACEP ESI v4 Implementation Handbook 2012", evidenceLevel: "A", tags: ["esi", "triage", "esi1", "immediate", "acuity"], lastUpdated: "2024-01" },
];

// ── Precision lookup ──────────────────────────────────────────────────────────

/**
 * Ask one specific clinical question. Returns only what answers it.
 * The article: "just the signature, just the explanation. No extra noise."
 */
export function precisionLookup(question: string, maxResults = 3): LookupResult {
  const qLower = question.toLowerCase();
  const qWords = qLower.split(/\W+/).filter((w) => w.length > 3);

  const scored = _kb.map((entry) => {
    // Score by tag match + question word overlap + numeric mention
    let score = 0;
    const entryText = `${entry.question} ${entry.tags.join(" ")} ${entry.answer}`.toLowerCase();

    for (const word of qWords) {
      if (entry.tags.some((t) => t.includes(word))) score += 3;
      if (entry.question.toLowerCase().includes(word))  score += 2;
      if (entry.answer.toLowerCase().includes(word))    score += 1;
    }

    // Boost if numeric terms mentioned
    if (qLower.match(/\d+/) && Object.keys(entry.numerics ?? {}).length > 0) score += 1;

    return { entry, score };
  });

  const matches = scored
    .filter((s) => s.score >= 3)   // minimum 3 = at least one tag hit; avoids stop-word matches
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.entry);

  const topScore = matches.length > 0
    ? scored.find((s) => s.entry.id === matches[0].id)?.score ?? 0
    : 0;
  const confidence = Math.min(topScore / 8, 1.0);
  const noiseRatio = (_kb.length - matches.length) / _kb.length;

  return {
    question,
    matched:   matches,
    topAnswer: matches[0] ?? null,
    confidence,
    noiseRatio,
  };
}

/**
 * Look up by tag (precise category drill-down).
 * e.g. tag "sepsis" → all sepsis entries, no chest pain noise.
 */
export function lookupByTag(tag: string): GuidelineEntry[] {
  return _kb.filter((e) => e.tags.includes(tag.toLowerCase()));
}

/** Look up a specific numeric threshold. */
export function lookupThreshold(
  concept: string
): { concept: string; numerics: Record<string, number | string>; source: string } | null {
  const lower = concept.toLowerCase();
  const match = _kb.find((e) =>
    e.tags.some((t) => t.includes(lower)) && Object.keys(e.numerics ?? {}).length > 0
  );
  if (!match) return null;
  return { concept, numerics: match.numerics!, source: match.source };
}

/** Format a lookup result as a model context injection — minimal, no noise. */
export function formatLookupResult(result: LookupResult): string {
  if (!result.topAnswer) return `No guideline found for: "${result.question}"`;

  const top = result.topAnswer;
  const lines = [
    `### Clinical Reference — ${top.source} [Evidence Level ${top.evidenceLevel}]`,
    `Q: ${result.question}`,
    `A: ${top.answer}`,
  ];

  if (top.numerics && Object.keys(top.numerics).length > 0) {
    lines.push(`Key thresholds: ${Object.entries(top.numerics).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  if (result.matched.length > 1) {
    lines.push(`\nRelated: ${result.matched.slice(1).map((e) => e.id).join(", ")}`);
  }

  lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}% | Noise filtered: ${(result.noiseRatio * 100).toFixed(0)}% of KB`);
  return lines.join("\n");
}

/** Add a new entry to the live knowledge base. */
export function addGuidelineEntry(entry: GuidelineEntry): void {
  _kb.push(entry);
}

/** List all tags in the knowledge base. */
export function listAllTags(): string[] {
  return [...new Set(_kb.flatMap((e) => e.tags))].sort();
}
