import fs from "fs";
import path from "path";
import { getFirestore } from "../firebase";
const db = getFirestore();

function norm(x: any) { return String(x ?? "").trim(); }
function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

const STOP = new Set([
  "the","and","for","with","that","this","have","been","your","you","are","was","were","not","can",
  "cant","could","would","should","from","into","just","like","need","feel","felt","help","please",
  "today","now","very","really","when","then","than","over","under","after","before","pain",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOP.has(t));
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + " " + tokens[i + 1]);
  return out;
}

function inc(m: Map<string, number>, k: string, by = 1) {
  m.set(k, (m.get(k) || 0) + by);
}

function topN(m: Map<string, number>, n = 20) {
  return Array.from(m.entries()).sort((a,b) => b[1]-a[1]).slice(0, n);
}

type HistEvent = {
  routerReason?: string;
  routerPickedFlowId?: string;
  routerPickedSystem?: string;
  routerTextSnippet?: string;
  confidence?: string;
  ts?: number;
};

type MisrouteKey = string;

async function main() {
  const DAYS = Number(process.env.REPORT_DAYS || 7);
  const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || "./reports";
  ensureDir(OUTPUT_DIR);

  const sinceMs = Date.now() - DAYS * 86400000;

  const snap = await db.collection("encounters")
    .where("updatedAt", ">=", new Date(sinceMs))
    .limit(6000)
    .get();

  const misrouteCounts = new Map<MisrouteKey, number>();
  const snippetCountsByToFlow = new Map<string, Map<string, number>>();
  const tokenCountsByToFlow = new Map<string, Map<string, number>>();
  const bigramCountsByToFlow = new Map<string, Map<string, number>>();
  const sampleSnipsByToFlow = new Map<string, string[]>();

  let total = 0;
  let withHistory = 0;
  let misrouteEvents = 0;

  for (const doc of snap.docs) {
    total++;
    const e: any = doc.data();

    let answersObj: any = {};
    try { answersObj = e.answers ? JSON.parse(e.answers) : {}; } catch { answersObj = {}; }

    const hist: HistEvent[] = Array.isArray(answersObj.__routerAuditHistory) ? answersObj.__routerAuditHistory : [];
    if (!hist.length) continue;

    withHistory++;

    const sorted = hist.slice().sort((a,b) => Number(a.ts||0) - Number(b.ts||0));

    const overrideIdx = [...sorted].reverse().findIndex(ev => norm(ev.routerReason) === "staff_override");
    if (overrideIdx < 0) continue;
    const idxFromEnd = overrideIdx;
    const idx = sorted.length - 1 - idxFromEnd;

    const override = sorted[idx];
    const toFlow = norm(override.routerPickedFlowId);
    if (!toFlow) continue;

    let pre: HistEvent | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      const rr = norm(sorted[j].routerReason);
      if (rr === "keyword" || rr === "other_text" || rr === "menu") {
        pre = sorted[j];
        break;
      }
    }
    if (!pre) continue;

    const fromFlow = norm(pre.routerPickedFlowId) || "UNKNOWN";
    const snippet = norm(pre.routerTextSnippet);
    if (!snippet) continue;

    if (fromFlow === toFlow) continue;

    misrouteEvents++;

    inc(misrouteCounts, `${fromFlow} -> ${toFlow}`);

    if (!snippetCountsByToFlow.has(toFlow)) snippetCountsByToFlow.set(toFlow, new Map());
    inc(snippetCountsByToFlow.get(toFlow)!, snippet);

    const tokens = tokenize(snippet);
    if (tokens.length) {
      if (!tokenCountsByToFlow.has(toFlow)) tokenCountsByToFlow.set(toFlow, new Map());
      if (!bigramCountsByToFlow.has(toFlow)) bigramCountsByToFlow.set(toFlow, new Map());

      const tm = tokenCountsByToFlow.get(toFlow)!;
      const bm = bigramCountsByToFlow.get(toFlow)!;
      for (const t of tokens) inc(tm, t);
      for (const b of bigrams(tokens)) inc(bm, b);
    }

    if (!sampleSnipsByToFlow.has(toFlow)) sampleSnipsByToFlow.set(toFlow, []);
    const arr = sampleSnipsByToFlow.get(toFlow)!;
    if (arr.length < 10) arr.push(`from=${fromFlow} text="${snippet.slice(0,140)}"`);
  }

  const mdPath = path.join(OUTPUT_DIR, "router_misroute_synonyms.md");
  const lines: string[] = [];

  lines.push(`# Router Misroute Synonym Suggestions (last ${DAYS} days)`);
  lines.push(`Scanned encounters: **${total}**`);
  lines.push(`Encounters w/ router history: **${withHistory}**`);
  lines.push(`Misroute override events detected: **${misrouteEvents}**`);
  lines.push(``);
  lines.push(`## Top misroute pairs (from -> to)`);
  for (const [k,v] of topN(misrouteCounts, 25)) lines.push(`- ${k}: ${v}`);
  lines.push(``);

  lines.push(`## Suggested synonyms by corrected flow`);
  const toFlows = Array.from(tokenCountsByToFlow.keys()).sort();

  for (const toFlow of toFlows) {
    const topTok = topN(tokenCountsByToFlow.get(toFlow)!, 20);
    const topBi = topN(bigramCountsByToFlow.get(toFlow)!, 12);
    const topSnips = topN(snippetCountsByToFlow.get(toFlow) || new Map(), 10);

    lines.push(`### ${toFlow}`);
    lines.push(`**Top tokens (candidates):** ${topTok.map(([k,v]) => `${k}(${v})`).join(", ")}`);
    lines.push(`**Top bigrams (candidates):** ${topBi.map(([k,v]) => `${k}(${v})`).join(", ")}`);
    lines.push(`**Top misrouted snippets:**`);
    for (const [s,v] of topSnips) lines.push(`- (${v}) "${s}"`);
    lines.push(`**Samples:**`);
    for (const s of (sampleSnipsByToFlow.get(toFlow) || [])) lines.push(`- ${s}`);
    lines.push(``);
  }

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  const jsonPath = path.join(OUTPUT_DIR, "router_misroute_synonyms_seed.json");
  const seed: any = {};
  for (const toFlow of toFlows) {
    seed[toFlow] = {
      tokens: topN(tokenCountsByToFlow.get(toFlow)!, 50),
      bigrams: topN(bigramCountsByToFlow.get(toFlow)!, 30),
      samples: sampleSnipsByToFlow.get(toFlow) || [],
      topMisroutesFrom: topN(
        new Map(Array.from(misrouteCounts.entries()).filter(([k,_]) => k.endsWith(`-> ${toFlow}`))),
        15
      ),
    };
  }
  fs.writeFileSync(jsonPath, JSON.stringify(seed, null, 2), "utf8");

  console.log(`Wrote: ${mdPath}`);
  console.log(`Wrote: ${jsonPath}`);
}

main().catch(e => {
  console.error("generateRouterSynonymSuggestions failed:", e);
  process.exit(1);
});
