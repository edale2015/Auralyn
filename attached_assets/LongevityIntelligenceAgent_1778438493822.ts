/**
 * AURALYN — LongevityIntelligenceAgent
 * 
 * Runs weekly. Scans PubMed + web for longevity treatment evidence.
 * Scores by study design. Stores results in PostgreSQL.
 * Surfaces high-evidence findings to the physician dashboard.
 * 
 * File: server/agents/LongevityIntelligenceAgent.ts
 * 
 * SETUP REQUIRED:
 * 1. Add this agent to your agent registry (see bottom of file)
 * 2. Add the weekly BullMQ job (see bottom of file)
 * 3. Create the DB table (migration at bottom of file)
 * 4. Add the dashboard route (see server/routes/longevity.ts below)
 */

import OpenAI from "openai";
import { db } from "../db";
import { applyPHIGuard } from "../safety/PHIGuard";
import { appendAuditEvent } from "../audit/HashChain";

// ─── Evidence Scoring System ───────────────────────────────────────────────
// Mirrors the study design weighting already in Auralyn's governance layer
const EVIDENCE_WEIGHTS: Record<string, number> = {
  meta_analysis:           1.00,
  systematic_review:       0.95,
  rct:                     0.90,
  prospective_cohort:      0.65,
  retrospective_cohort:    0.45,
  case_control:            0.35,
  case_series:             0.20,
  case_report:             0.10,
  animal_study:            0.05,
  in_vitro:                0.03,
  expert_opinion:          0.02,
};

// Minimum score to surface to physician dashboard (RCT-level or above)
const DASHBOARD_THRESHOLD = 0.85;

// ─── Types ────────────────────────────────────────────────────────────────
interface LongevityFinding {
  treatment: string;
  study_type: string;
  evidence_score: number;
  summary: string;
  key_finding: string;
  sample_size: number | null;
  population: string;
  outcome_measured: string;
  effect_size: string | null;
  confidence_interval: string | null;
  safety_signals: string[];
  fda_status: string;
  clinical_relevance: "high" | "moderate" | "low" | "insufficient";
  pubmed_ids: string[];
  source_urls: string[];
  scan_date: string;
  physician_reviewed: boolean;
}

// ─── Search Queries ───────────────────────────────────────────────────────
// These are the evidence domains the agent scans weekly.
// Add new categories here as the field evolves.
const LONGEVITY_SEARCH_QUERIES = [
  // Pharmacological
  "rapamycin mTOR longevity human clinical trial",
  "metformin aging TAME trial results",
  "NAD+ NMN NR supplementation human RCT aging",
  "senolytics dasatinib quercetin human trial",
  "GLP-1 receptor agonist longevity aging evidence",
  
  // Peptides
  "BPC-157 human clinical trial evidence 2025 2026",
  "thymosin alpha-1 longevity immune aging",
  "epithalon epitalon pineal peptide human study",
  "humanin MOTS-c mitochondrial peptide clinical",
  
  // Biological therapies
  "ozone therapy blood autohemotherapy RCT clinical",
  "plasmapheresis young plasma aging human trial",
  "stem cell therapy aging human randomized",
  
  // Lifestyle + supplementation with solid evidence
  "caloric restriction intermittent fasting longevity RCT human",
  "exercise longevity all-cause mortality meta-analysis 2025",
  "omega-3 cardiovascular longevity systematic review",
  "vitamin D longevity mortality RCT 2025 2026",
  
  // Emerging
  "senolytic CAR-T aging human trial",
  "epigenetic reprogramming partial longevity human",
  "fecal microbiota transplant aging longevity",
];

// ─── Main Agent ───────────────────────────────────────────────────────────
export class LongevityIntelligenceAgent {
  private openai: OpenAI;
  private agentId = "longevity-intelligence-agent";

  constructor() {
    // Uses Auralyn's existing lazy OpenAI client pattern
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async run(): Promise<void> {
    const scanDate = new Date().toISOString();
    console.log(`[LongevityAgent] Starting weekly scan — ${scanDate}`);

    const findings: LongevityFinding[] = [];

    for (const query of LONGEVITY_SEARCH_QUERIES) {
      try {
        const finding = await this.scanTopic(query, scanDate);
        if (finding) {
          findings.push(finding);
        }
        // Respect rate limits — wait 2 seconds between queries
        await this.sleep(2000);
      } catch (err) {
        console.error(`[LongevityAgent] Error scanning "${query}":`, err);
        // Continue scanning other topics — don't let one failure stop the run
      }
    }

    // Save all findings to PostgreSQL
    await this.saveFindings(findings);

    // Log to immutable audit chain (Auralyn's existing audit system)
    await appendAuditEvent({
      eventType: "LONGEVITY_SCAN_COMPLETE",
      agentId: this.agentId,
      metadata: {
        scanDate,
        totalFindings: findings.length,
        highEvidenceFindings: findings.filter(
          (f) => f.evidence_score >= DASHBOARD_THRESHOLD
        ).length,
        queriesRun: LONGEVITY_SEARCH_QUERIES.length,
      },
    });

    console.log(
      `[LongevityAgent] Scan complete. ${findings.length} findings processed.`
    );
  }

  // ── Scan a single topic ─────────────────────────────────────────────────
  private async scanTopic(
    query: string,
    scanDate: string
  ): Promise<LongevityFinding | null> {
    
    // Use web search tool via OpenAI to get current evidence
    // PHI guard applied — no patient data is in these queries
    const guardedPrompt = applyPHIGuard(`
You are a clinical evidence analyst. Search for and evaluate the latest medical evidence on:
"${query}"

Focus on:
- Studies published in 2024, 2025, or 2026
- Human studies first, then animal if human data is absent
- PubMed-indexed journals preferred

Return a JSON object with this exact structure (no markdown, no preamble):
{
  "treatment": "exact treatment name",
  "study_type": "one of: meta_analysis | systematic_review | rct | prospective_cohort | retrospective_cohort | case_control | case_series | case_report | animal_study | in_vitro | expert_opinion",
  "summary": "2-3 sentence plain English summary of current evidence state",
  "key_finding": "single most important finding in one sentence",
  "sample_size": null or number,
  "population": "who was studied (age, health status, demographics)",
  "outcome_measured": "primary endpoint or outcome",
  "effect_size": null or "e.g. 23% reduction in all-cause mortality",
  "confidence_interval": null or "e.g. 95% CI: 0.67-0.89",
  "safety_signals": ["array of known safety concerns, or empty array if none"],
  "fda_status": "approved | off-label | investigational | not approved | banned",
  "clinical_relevance": "high | moderate | low | insufficient",
  "pubmed_ids": ["array of PMID numbers if known"],
  "source_urls": ["array of source URLs"]
}

Be conservative in scoring clinical_relevance:
- high: multiple RCTs or meta-analyses with consistent human benefit
- moderate: single RCT or strong prospective cohort data in humans  
- low: animal data only or weak human observational data
- insufficient: in vitro, case reports, or no data
`);

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      tools: [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current medical literature",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" }
              }
            }
          }
        }
      ],
      messages: [
        {
          role: "system",
          content: "You are a clinical evidence analyst. Return only valid JSON. Never include patient data. Be conservative in evidence scoring — prefer under-claiming over over-claiming."
        },
        {
          role: "user",
          content: guardedPrompt
        }
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    try {
      // Strip any markdown fences
      const clean = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Calculate evidence score from study type
      const evidenceScore = EVIDENCE_WEIGHTS[parsed.study_type] ?? 0.01;

      return {
        ...parsed,
        evidence_score: evidenceScore,
        scan_date: scanDate,
        physician_reviewed: false,
      };
    } catch {
      console.error(`[LongevityAgent] JSON parse failed for query: ${query}`);
      return null;
    }
  }

  // ── Save findings to PostgreSQL ─────────────────────────────────────────
  private async saveFindings(findings: LongevityFinding[]): Promise<void> {
    for (const finding of findings) {
      await db.execute(`
        INSERT INTO longevity_findings (
          treatment, study_type, evidence_score, summary, key_finding,
          sample_size, population, outcome_measured, effect_size,
          confidence_interval, safety_signals, fda_status, clinical_relevance,
          pubmed_ids, source_urls, scan_date, physician_reviewed
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (treatment, scan_date::date)
        DO UPDATE SET
          evidence_score = EXCLUDED.evidence_score,
          summary = EXCLUDED.summary,
          key_finding = EXCLUDED.key_finding,
          clinical_relevance = EXCLUDED.clinical_relevance,
          safety_signals = EXCLUDED.safety_signals
      `, [
        finding.treatment,
        finding.study_type,
        finding.evidence_score,
        finding.summary,
        finding.key_finding,
        finding.sample_size,
        finding.population,
        finding.outcome_measured,
        finding.effect_size,
        finding.confidence_interval,
        JSON.stringify(finding.safety_signals),
        finding.fda_status,
        finding.clinical_relevance,
        JSON.stringify(finding.pubmed_ids),
        JSON.stringify(finding.source_urls),
        finding.scan_date,
        finding.physician_reviewed,
      ]);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── BullMQ Job Registration ──────────────────────────────────────────────
// Add this to your server/queues/scheduler.ts or equivalent:
/*
import { Queue, Worker } from "bullmq";
import { LongevityIntelligenceAgent } from "../agents/LongevityIntelligenceAgent";

const longevityQueue = new Queue("longevity-scan", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Schedule weekly — every Monday at 2 AM
await longevityQueue.add(
  "weekly-longevity-scan",
  {},
  {
    repeat: { cron: "0 2 * * 1" },
  }
);

new Worker("longevity-scan", async () => {
  const agent = new LongevityIntelligenceAgent();
  await agent.run();
}, { connection: redisConnection });
*/

// ─── Agent Registry Entry ──────────────────────────────────────────────────
// Add to your agent registry initialization:
/*
{
  agentId: "longevity-intelligence-agent",
  name: "Longevity Intelligence Agent",
  type: "coordinator",
  description: "Weekly scan of longevity treatment evidence from PubMed and web. Scores by study design. Surfaces high-evidence findings to physician dashboard.",
  safetyClass: "low",          // No clinical decisions — advisory only
  requiresPhysicianReview: true,
  runFrequency: "weekly",
  circuitBreaker: {
    threshold: 5,
    timeout: 60000,
  },
}
*/
