/**
 * researchRadar.ts
 * Drop into: server/harness/researchRadar.ts
 *
 * Automated research monitoring for Recommendations 5 and 6.
 * Runs weekly and surfaces readiness signals in the Auralyn admin dashboard.
 *
 * WHAT IT MONITORS:
 *
 *   Recommendation 5 — Temporal Graph EHR Patterns
 *   Target: InfEHR-style deep geometric learning on EHR trajectories.
 *   Watching for: production library, deployable API, or clinical validation
 *   of graph-based EHR temporal reasoning that can plug into the Win 9 FHIR layer.
 *   Readiness signals: open-source Python/TS library, FDA clearance of graph
 *   EHR system, or major EHR vendor (Epic/Oracle) shipping graph-based CDS.
 *
 *   Recommendation 6 — Graph Neural Network Differential Diagnosis
 *   Target: GNN-based differential that replaces LLM token prediction with
 *   structured graph traversal over a curated clinical knowledge graph.
 *   Watching for: SNOMED-CT or ICD-11 graph embeddings as deployable API,
 *   GNN differential diagnosis tool with clinical validation study,
 *   or Zitnik Lab / Harvard Graph AI releasing a production medical GNN.
 *
 * HOW IT WORKS:
 *   Weekly BullMQ job calls Claude with web search to scan:
 *   - arXiv cs.AI, cs.LG, q-bio.QM for new papers
 *   - GitHub for new repositories
 *   - Medium/Substack for practitioner reports
 *   - FDA device database for new clearances
 *   Then scores readiness on a 5-point scale and stores the report.
 *
 * READINESS SCALE:
 *   1 — Research only (current state)
 *   2 — Preprint with clinical validation
 *   3 — Open-source code available, no clinical validation
 *   4 — Open-source with clinical validation study
 *   5 — Production-ready: deploy now
 *
 * ALERT THRESHOLD: Score >= 4 → email/dashboard alert to physician admin
 *
 * SCHEDULE: Weekly, Sunday 4am UTC (off-peak, before Monday review)
 */

import Anthropic      from "@anthropic-ai/sdk";
import { db }         from "../db";
import { sql }        from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";

const anthropic = new Anthropic();

// ─── Recommendation definitions ───────────────────────────────────────────────

export interface ResearchTarget {
  id:            string;
  name:          string;
  description:   string;
  clinicalValue: string;
  auralynaImpact: string;
  readinessScore: number;   // 1-5, starts at 1
  searchQueries:  string[];
  readinessSignals: string[];
  implementationNotes: string;
  estimatedBuildTime: string;
  lastChecked?:   string;
  lastReport?:    string;
}

export const RESEARCH_TARGETS: ResearchTarget[] = [
  {
    id:          "rec5_temporal_graph_ehr",
    name:        "Recommendation 5 — Temporal Graph EHR Patterns",
    description: "Deep geometric learning on EHR temporal trajectories. Each patient's clinical history modeled as a graph where nodes are clinical events (diagnoses, labs, medications) connected by typed temporal edges. The graph captures disease progression patterns that flat LLM reasoning cannot represent.",
    clinicalValue: "Predicts disease trajectory from EHR history rather than just current symptoms. A patient with 3 prior UTIs in 6 months has a geometrically different risk profile than a first-time UTI — the temporal graph captures this. Enables proactive triage based on trajectory, not just current presentation.",
    auralynaImpact: "Plugs into Win 9 FHIR layer. When EHR context is fetched for a patient, their temporal EHR graph feeds into the geometric reasoning layer (Win 12) alongside the current symptom answers. Changes the differential from 'what does this look like now' to 'what does this trajectory suggest'.",
    readinessScore: 1,
    searchQueries: [
      "temporal EHR graph neural network clinical production 2026",
      "InfEHR deep geometric learning electronic health records deployment",
      "graph neural network EHR trajectory clinical decision support library",
      "SNOMED temporal graph clinical AI open source",
      "EHR graph embedding production API medical",
    ],
    readinessSignals: [
      "Open-source Python or TypeScript library for EHR temporal graph construction",
      "Clinical validation study (prospective, not just retrospective) published",
      "FDA 510(k) clearance of graph-based EHR CDS tool",
      "Epic or Oracle Health shipping graph-based temporal CDS",
      "ArXiv preprint with publicly available code and medical ontology integration",
    ],
    implementationNotes: "Wire into server/integrations/ehr/fhirPatientContext.ts. After fetching PatientContext, pass the temporal sequence of conditions/medications/labs through the graph constructor. Output feeds into geometricReasoningIntegrator.ts as an additional context layer. No changes to physician UI required — the enriched context appears in the CDS sidebar automatically.",
    estimatedBuildTime: "2-3 weeks once a production library is available",
    readinessScore: 1,
  },
  {
    id:          "rec6_gnn_differential",
    name:        "Recommendation 6 — Graph Neural Network Differential Diagnosis",
    description: "Replace LLM token-prediction differential diagnosis with structured graph traversal over a curated clinical knowledge graph. Instead of the LLM predicting the most probable next tokens given symptom text, a GNN reasons over explicit symptom-diagnosis-treatment nodes with typed edges weighted by clinical evidence strength.",
    clinicalValue: "GNN differential is structurally incapable of hallucinating a diagnosis that has no graph path from the presented symptoms. The current LLM can confidently suggest a rare condition with no evidentiary basis — the GNN cannot. Every differential item has an auditable graph path the physician can inspect.",
    auralynaImpact: "Replaces or supplements runClinicalBrain() in server/agent/pipeline.ts. The GNN differential runs first, producing a structured evidence-grounded differential. The LLM then adds clinical reasoning narrative on top. The physician sees both: the GNN's graph-backed differential and the LLM's reasoning explanation. Radical improvement in explainability and auditability.",
    readinessScore: 1,
    searchQueries: [
      "graph neural network differential diagnosis production deployment 2026",
      "clinical knowledge graph GNN diagnosis API medical",
      "Zitnik lab Harvard graph AI medicine production",
      "SNOMED ICD-11 graph embeddings deployable API diagnosis",
      "medical knowledge graph differential diagnosis open source library",
      "GNN clinical decision support FDA cleared",
    ],
    readinessSignals: [
      "Zitnik Lab or similar releasing production GNN medical inference API",
      "SNOMED International releasing graph embedding service for clinical reasoning",
      "Open-source GNN differential diagnosis library with ICD-10/SNOMED integration",
      "Clinical trial demonstrating GNN differential superiority over LLM-only",
      "Major clinical AI company (Nabla, Suki, Abridge) integrating GNN differential",
    ],
    implementationNotes: "Requires: (1) curated clinical knowledge graph (SNOMED-CT or ICD-11 based), (2) trained GNN model for urgent care complaint space, (3) inference API or local model. Wire as a pre-LLM step in the triage pipeline. The clinicalKnowledgeGraph.ts already built in Win 12 is the structural prototype — the GNN version uses learned edge weights from training data rather than manually specified likelihood ratios.",
    estimatedBuildTime: "4-6 weeks once a clinical GNN library is available. The Win 12 knowledge graph we already built is directly compatible — it would become the GNN's initial graph structure.",
  },
];

// ─── Readiness scorer ─────────────────────────────────────────────────────────

interface RadarScanResult {
  targetId:       string;
  scannedAt:      string;
  newReadinessScore: number;
  scoreChanged:   boolean;
  findings:       string[];
  readyToImplement: boolean;
  report:         string;
  sources:        string[];
}

async function scanTarget(target: ResearchTarget): Promise<RadarScanResult> {
  const scannedAt = new Date().toISOString();

  // Use Claude with web search to scan for readiness signals
  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1500,
    tools: [{
      type: "web_search_20250305",
      name: "web_search",
    }] as any,
    system: `You are a research radar agent for Auralyn, a clinical AI system for urgent care.
Your job: scan the web for evidence that a specific technology is now production-ready
for a medical AI system.

Be conservative. Medical AI readiness requires:
- Clinical validation (not just benchmark performance)
- Deployable code or API (not just a research paper)
- Safety evidence appropriate for a clinical setting

Score readiness on this scale:
1 = Research only, no deployable code
2 = Preprint with clinical validation data, no code
3 = Open-source code available, limited clinical validation
4 = Open-source code + clinical validation study + safety documentation
5 = Production-ready: can be integrated into a clinical system today

Return ONLY valid JSON:
{
  "readinessScore": number,
  "findings": string[],
  "readyToImplement": boolean,
  "report": string,
  "sources": string[]
}`,
    messages: [{
      role:    "user",
      content: `Scan for production readiness of this technology for a medical AI system:

TARGET: ${target.name}
DESCRIPTION: ${target.description}

SEARCH QUERIES TO USE: ${target.searchQueries.join(", ")}

READINESS SIGNALS TO LOOK FOR:
${target.readinessSignals.map(s => `- ${s}`).join("\n")}

CURRENT READINESS SCORE: ${target.readinessScore}/5

Conduct web searches, assess what you find, and return your readiness assessment.`,
    }],
  });

  // Extract text from response (web search results are in tool use blocks)
  const textContent = response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("");

  let parsed: any;
  try {
    const clean = textContent.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    // Parsing failure — return conservative result
    parsed = {
      readinessScore:   target.readinessScore,
      findings:         ["Scan completed but structured output could not be parsed"],
      readyToImplement: false,
      report:           textContent.slice(0, 500),
      sources:          [],
    };
  }

  const scoreChanged = parsed.readinessScore !== target.readinessScore;

  return {
    targetId:          target.id,
    scannedAt,
    newReadinessScore: parsed.readinessScore,
    scoreChanged,
    findings:          parsed.findings ?? [],
    readyToImplement:  parsed.readyToImplement ?? false,
    report:            parsed.report ?? "",
    sources:           parsed.sources ?? [],
  };
}

// ─── Weekly scan runner ───────────────────────────────────────────────────────

export interface WeeklyRadarReport {
  runId:     string;
  runAt:     string;
  targets:   Array<RadarScanResult & { target: ResearchTarget }>;
  alerts:    Array<{ targetId: string; name: string; newScore: number; message: string }>;
  summary:   string;
}

export async function runWeeklyResearchRadar(): Promise<WeeklyRadarReport> {
  const runId = `radar-${Date.now()}`;
  const runAt = new Date().toISOString();

  console.log(`[ResearchRadar] Starting weekly scan — runId: ${runId}`);

  const results: Array<RadarScanResult & { target: ResearchTarget }> = [];
  const alerts:  WeeklyRadarReport["alerts"] = [];

  for (const target of RESEARCH_TARGETS) {
    console.log(`[ResearchRadar] Scanning: ${target.name}`);

    const result = await scanTarget(target);
    results.push({ ...result, target });

    // Alert if readiness score increased to >= 4
    if (result.newReadinessScore >= 4 && result.scoreChanged) {
      alerts.push({
        targetId: target.id,
        name:     target.name,
        newScore: result.newReadinessScore,
        message:  `🚨 IMPLEMENTATION READY: ${target.name} has reached readiness score ${result.newReadinessScore}/5. Estimated build time: ${target.estimatedBuildTime}. Review findings and schedule implementation sprint.`,
      });
    }

    // Alert if any score changed at all (for tracking)
    if (result.scoreChanged) {
      console.log(`[ResearchRadar] Score change: ${target.name} ${target.readinessScore} → ${result.newReadinessScore}`);
    }

    // Update stored readiness score
    await db.execute(sql`
      INSERT INTO research_radar_scores (target_id, readiness_score, last_scanned_at)
      VALUES (${target.id}, ${result.newReadinessScore}, ${runAt})
      ON CONFLICT (target_id) DO UPDATE
        SET readiness_score = ${result.newReadinessScore},
            last_scanned_at = ${runAt}
    `).catch(console.error);

    // Small delay between scans to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const readyCount = results.filter(r => r.readyToImplement).length;
  const summary = alerts.length > 0
    ? `⚠️ ${alerts.length} RECOMMENDATION(S) NOW READY FOR IMPLEMENTATION. Immediate review required.`
    : `Weekly scan complete. ${RESEARCH_TARGETS.length} targets monitored. No new implementations ready. ${results.filter(r => r.scoreChanged).length} score changes detected.`;

  const report: WeeklyRadarReport = { runId, runAt, targets: results, alerts, summary };

  // Persist full report
  await db.execute(sql`
    INSERT INTO research_radar_reports (run_id, run_at, report_json, alert_count)
    VALUES (${runId}, ${runAt}, ${JSON.stringify(report)}, ${alerts.length})
  `).catch(console.error);

  // Audit event
  await appendAuditEvent({
    actor:      "system",
    action:     "RESEARCH_RADAR_COMPLETED",
    entityId:   runId,
    entityType: "system",
    details: {
      targetsScanned: RESEARCH_TARGETS.length,
      alertCount:     alerts.length,
      scoreChanges:   results.filter(r => r.scoreChanged).length,
    },
  }).catch(console.error);

  if (alerts.length > 0) {
    console.warn(`[ResearchRadar] ⚠️ ${alerts.length} IMPLEMENTATION ALERTS:\n${alerts.map(a => a.message).join("\n")}`);
  }

  console.log(`[ResearchRadar] Complete — ${summary}`);
  return report;
}

// ─── Manual readiness check ───────────────────────────────────────────────────
// Call this from the command interface: "check research readiness"

export async function getRadarStatus(): Promise<{
  targets: Array<{
    id:            string;
    name:          string;
    readinessScore: number;
    lastScanned:   string | null;
    readyToImplement: boolean;
    estimatedBuildTime: string;
  }>;
  nextScan:      string;
  anyReady:      boolean;
}> {
  const rows = await db.execute(sql`
    SELECT target_id, readiness_score, last_scanned_at
    FROM research_radar_scores
  `).catch(() => ({ rows: [] }));

  const scoreMap = new Map(
    (rows.rows as any[]).map(r => [r.target_id, { score: r.readiness_score, scanned: r.last_scanned_at }])
  );

  const targets = RESEARCH_TARGETS.map(t => {
    const stored = scoreMap.get(t.id);
    const score  = stored?.score ?? t.readinessScore;
    return {
      id:               t.id,
      name:             t.name,
      readinessScore:   score,
      lastScanned:      stored?.scanned ?? null,
      readyToImplement: score >= 4,
      estimatedBuildTime: t.estimatedBuildTime,
    };
  });

  // Next Sunday 4am UTC
  const now      = new Date();
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  const nextScan = new Date(now);
  nextScan.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextScan.setUTCHours(4, 0, 0, 0);

  return {
    targets,
    nextScan:  nextScan.toISOString(),
    anyReady:  targets.some(t => t.readyToImplement),
  };
}
