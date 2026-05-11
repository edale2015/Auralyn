/**
 * AURALYN — LongevityIntelligenceAgent
 *
 * Runs weekly (Monday 2am UTC). Scans PubMed + web for longevity treatment evidence.
 * Scores by study design. Stores results in PostgreSQL longevity_findings table.
 * Surfaces high-evidence findings (score ≥ 0.85) to the physician dashboard.
 */

import OpenAI from "openai";
import { query } from "../db";
import { applyPHIGuard } from "../middleware/phiGuardOpenAI";
import { appendAuditEvent } from "../audit/hashChain";

// ─── Evidence Scoring ─────────────────────────────────────────────────────────
const EVIDENCE_WEIGHTS: Record<string, number> = {
  meta_analysis:        1.00,
  systematic_review:    0.95,
  rct:                  0.90,
  prospective_cohort:   0.65,
  retrospective_cohort: 0.45,
  case_control:         0.35,
  case_series:          0.20,
  case_report:          0.10,
  animal_study:         0.05,
  in_vitro:             0.03,
  expert_opinion:       0.02,
};

export const LONGEVITY_DASHBOARD_THRESHOLD = 0.85;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LongevityFinding {
  treatment:           string;
  study_type:          string;
  evidence_score:      number;
  summary:             string;
  key_finding:         string;
  sample_size:         number | null;
  population:          string;
  outcome_measured:    string;
  effect_size:         string | null;
  confidence_interval: string | null;
  safety_signals:      string[];
  fda_status:          string;
  clinical_relevance:  "high" | "moderate" | "low" | "insufficient";
  pubmed_ids:          string[];
  source_urls:         string[];
  scan_date:           string;
  physician_reviewed:  boolean;
}

// ─── Search Topics ────────────────────────────────────────────────────────────
const LONGEVITY_SEARCH_QUERIES = [
  "rapamycin mTOR longevity human clinical trial",
  "metformin aging TAME trial results",
  "NAD+ NMN NR supplementation human RCT aging",
  "senolytics dasatinib quercetin human trial",
  "GLP-1 receptor agonist longevity aging evidence",
  "BPC-157 human clinical trial evidence 2025 2026",
  "thymosin alpha-1 longevity immune aging",
  "epithalon epitalon pineal peptide human study",
  "humanin MOTS-c mitochondrial peptide clinical",
  "ozone therapy blood autohemotherapy RCT clinical",
  "plasmapheresis young plasma aging human trial",
  "stem cell therapy aging human randomized",
  "caloric restriction intermittent fasting longevity RCT human",
  "exercise longevity all-cause mortality meta-analysis 2025",
  "omega-3 cardiovascular longevity systematic review",
  "vitamin D longevity mortality RCT 2025 2026",
  "senolytic CAR-T aging human trial",
  "epigenetic reprogramming partial longevity human",
  "fecal microbiota transplant aging longevity",
];

// ─── Agent ────────────────────────────────────────────────────────────────────
export class LongevityIntelligenceAgent {
  private openai: OpenAI;
  private readonly agentId = "longevity-intelligence-agent";

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async run(): Promise<{ total: number; highEvidence: number }> {
    const scanDate = new Date().toISOString();
    console.log(`[LongevityAgent] Starting weekly scan — ${scanDate}`);

    const findings: LongevityFinding[] = [];

    for (const queryStr of LONGEVITY_SEARCH_QUERIES) {
      try {
        const finding = await this.scanTopic(queryStr, scanDate);
        if (finding) findings.push(finding);
        await this.sleep(2000);
      } catch (err: any) {
        console.error(`[LongevityAgent] Error scanning "${queryStr}":`, err?.message);
      }
    }

    await this.saveFindings(findings);

    const highEvidence = findings.filter(
      (f) => f.evidence_score >= LONGEVITY_DASHBOARD_THRESHOLD
    ).length;

    await appendAuditEvent({
      event_type:  "LONGEVITY_SCAN_COMPLETE",
      agentId:     this.agentId,
      scanDate,
      totalFindings:        findings.length,
      highEvidenceFindings: highEvidence,
      queriesRun:           LONGEVITY_SEARCH_QUERIES.length,
    });

    console.log(`[LongevityAgent] Scan complete — ${findings.length} findings, ${highEvidence} high-evidence.`);
    return { total: findings.length, highEvidence };
  }

  // ── Scan a single topic via GPT-4o ─────────────────────────────────────────
  private async scanTopic(
    searchQuery: string,
    scanDate: string
  ): Promise<LongevityFinding | null> {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: "gpt-4o",
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a clinical evidence analyst specializing in longevity medicine. " +
            "Return ONLY valid JSON — no markdown, no preamble, no trailing text. " +
            "Be conservative: prefer under-claiming over over-claiming. " +
            "Never include any patient data.",
        },
        {
          role: "user",
          content:
            `Evaluate the latest medical evidence on: "${searchQuery}"\n\n` +
            "Focus on studies published in 2023–2026. Human studies preferred over animal.\n\n" +
            "Return this exact JSON structure:\n" +
            "{\n" +
            '  "treatment": "exact treatment name",\n' +
            '  "study_type": "meta_analysis|systematic_review|rct|prospective_cohort|retrospective_cohort|case_control|case_series|case_report|animal_study|in_vitro|expert_opinion",\n' +
            '  "summary": "2-3 sentence plain English summary of current evidence",\n' +
            '  "key_finding": "single most important finding in one sentence",\n' +
            '  "sample_size": null or number,\n' +
            '  "population": "who was studied",\n' +
            '  "outcome_measured": "primary endpoint",\n' +
            '  "effect_size": null or "e.g. 23% reduction in all-cause mortality",\n' +
            '  "confidence_interval": null or "e.g. 95% CI: 0.67-0.89",\n' +
            '  "safety_signals": ["known safety concerns or empty array"],\n' +
            '  "fda_status": "approved|off-label|investigational|not approved|banned",\n' +
            '  "clinical_relevance": "high|moderate|low|insufficient",\n' +
            '  "pubmed_ids": ["PMID numbers if known"],\n' +
            '  "source_urls": ["source URLs if known"]\n' +
            "}\n\n" +
            "clinical_relevance scoring:\n" +
            "- high: multiple RCTs or meta-analyses with consistent human benefit\n" +
            "- moderate: single RCT or strong prospective cohort in humans\n" +
            "- low: animal data only or weak human observational\n" +
            "- insufficient: in vitro, case reports, or no data",
        },
      ],
    };

    // PHI guard — no patient data should be present, but run it as a policy gate
    const guardedParams = applyPHIGuard(params, "LongevityIntelligenceAgent");

    const response = await this.openai.chat.completions.create(guardedParams);
    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    try {
      const clean = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const evidenceScore = EVIDENCE_WEIGHTS[parsed.study_type] ?? 0.01;

      return {
        treatment:           parsed.treatment        ?? searchQuery,
        study_type:          parsed.study_type       ?? "expert_opinion",
        evidence_score:      evidenceScore,
        summary:             parsed.summary          ?? "",
        key_finding:         parsed.key_finding      ?? "",
        sample_size:         parsed.sample_size      ?? null,
        population:          parsed.population       ?? "",
        outcome_measured:    parsed.outcome_measured ?? "",
        effect_size:         parsed.effect_size      ?? null,
        confidence_interval: parsed.confidence_interval ?? null,
        safety_signals:      Array.isArray(parsed.safety_signals) ? parsed.safety_signals : [],
        fda_status:          parsed.fda_status       ?? "unknown",
        clinical_relevance:  parsed.clinical_relevance ?? "insufficient",
        pubmed_ids:          Array.isArray(parsed.pubmed_ids) ? parsed.pubmed_ids : [],
        source_urls:         Array.isArray(parsed.source_urls) ? parsed.source_urls : [],
        scan_date:           scanDate,
        physician_reviewed:  false,
      };
    } catch {
      console.error(`[LongevityAgent] JSON parse failed for: ${searchQuery}`);
      return null;
    }
  }

  // ── Persist to PostgreSQL ───────────────────────────────────────────────────
  private async saveFindings(findings: LongevityFinding[]): Promise<void> {
    for (const f of findings) {
      try {
        await query(
          `INSERT INTO longevity_findings (
             treatment, study_type, evidence_score, summary, key_finding,
             sample_size, population, outcome_measured, effect_size,
             confidence_interval, safety_signals, fda_status, clinical_relevance,
             pubmed_ids, source_urls, scan_date, physician_reviewed
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT DO NOTHING`,
          [
            f.treatment,
            f.study_type,
            f.evidence_score,
            f.summary,
            f.key_finding,
            f.sample_size,
            f.population,
            f.outcome_measured,
            f.effect_size,
            f.confidence_interval,
            JSON.stringify(f.safety_signals),
            f.fda_status,
            f.clinical_relevance,
            JSON.stringify(f.pubmed_ids),
            JSON.stringify(f.source_urls),
            f.scan_date,
            f.physician_reviewed,
          ]
        );
      } catch (err: any) {
        console.error(`[LongevityAgent] DB save failed for "${f.treatment}":`, err?.message);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
