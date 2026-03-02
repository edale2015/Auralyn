import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

process.env.HARNESS_MODE = "1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CASE_STORE = path.resolve(__dirname, "../data/case_store.jsonl");

interface StoredCase {
  case_id: string;
  complaint_slug: string;
  answers: Record<string, string>;
  meta?: { source?: string; ts?: string };
}

function loadCase(caseId: string): StoredCase | null {
  if (!fs.existsSync(CASE_STORE)) return null;
  const lines = fs.readFileSync(CASE_STORE, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as StoredCase;
      if (obj.case_id === caseId) return obj;
    } catch {}
  }
  return null;
}

function listCases(filter?: string): StoredCase[] {
  if (!fs.existsSync(CASE_STORE)) return [];
  const lines = fs.readFileSync(CASE_STORE, "utf8").split("\n").filter(Boolean);
  const cases: StoredCase[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as StoredCase;
      if (!filter || obj.case_id.includes(filter) || obj.complaint_slug.includes(filter)) {
        cases.push(obj);
      }
    } catch {}
  }
  return cases;
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "--list") {
    const filter = process.argv[3];
    const cases = listCases(filter);
    if (cases.length === 0) {
      console.log("No cases found in case store.");
      console.log(`Store path: ${CASE_STORE}`);
      process.exit(0);
    }
    console.log(`Found ${cases.length} case(s):`);
    for (const c of cases) {
      const ansCount = Object.keys(c.answers).length;
      console.log(`  ${c.case_id}  ${c.complaint_slug}  (${ansCount} answers)  ${c.meta?.source || ""}`);
    }
    process.exit(0);
  }

  if (arg === "--add") {
    const slug = process.argv[3];
    const jsonPath = process.argv[4];
    if (!slug || !jsonPath) {
      console.error("Usage: tsx scripts/replay.ts --add <complaint_slug> <answers.json>");
      process.exit(2);
    }
    const answers = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const ts = new Date().toISOString();
    const id = `CASE_${ts.replace(/[-:T.Z]/g, "").slice(0, 14)}_${slug}`;
    const entry: StoredCase = {
      case_id: id,
      complaint_slug: slug,
      answers,
      meta: { source: "manual", ts },
    };
    fs.appendFileSync(CASE_STORE, JSON.stringify(entry) + "\n");
    console.log(`Added case: ${id}`);
    process.exit(0);
  }

  const caseId = arg;
  const c = loadCase(caseId);
  if (!c) {
    console.error(`Case not found: ${caseId}`);
    const similar = listCases(caseId);
    if (similar.length > 0) {
      console.error("Did you mean:");
      for (const s of similar.slice(0, 5)) {
        console.error(`  ${s.case_id}`);
      }
    }
    process.exit(1);
  }

  const { runGenericComplaintV1 } = await import("../server/engines/genericComplaintEngineV1");

  const state: any = {
    patientId: `replay_${c.case_id}`,
    encounterId: `replay_${c.case_id}`,
    answers: c.answers,
    scores: {},
    redFlags: [],
    activeClusters: [],
    dispositionReasonCodes: [],
    routing: { state: "COMPLAINT_ACTIVE" },
    normalizedComplaint: c.complaint_slug,
    questionQueue: [],
    requiredQuestionIdsMissing: [],
    diagnosisCandidates: [],
  };

  const result = await runGenericComplaintV1(state, c.complaint_slug);

  const output = {
    case_id: c.case_id,
    complaint_slug: c.complaint_slug,
    disposition: result.state.disposition,
    top_cluster: result.state.activeClusters?.[0] || "",
    confidence: result.state.caseConfidence,
    clusters: result.state.activeClusters,
    cluster_scores: result.state.clusterScores,
    red_flags: result.state.redFlags,
    rf_gate: result.state.redFlagGate?.gateResult,
    explanation: (result.state as any).scoringExplanation || null,
    events: result.events.map(e => e.message),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
