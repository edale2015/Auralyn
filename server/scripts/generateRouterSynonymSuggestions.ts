import fs from "fs";
import path from "path";
import { db } from "../firebase";

function norm(x: any) { return String(x ?? "").trim(); }
function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

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

const STOP = new Set([
  "the","and","for","with","that","this","have","been","your","you","are","was","were","not","can",
  "cant","could","would","should","from","into","just","like","need","feel","felt","pain","help",
  "please","today","now","very","really","when","then","than","over","under","after","before",
]);

function inc(m: Map<string, number>, k: string, by = 1) {
  m.set(k, (m.get(k) || 0) + by);
}

function topN(m: Map<string, number>, n = 20) {
  return Array.from(m.entries()).sort((a,b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const DAYS = Number(process.env.REPORT_DAYS || 7);
  const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || "./reports";
  ensureDir(OUTPUT_DIR);

  const sinceMs = Date.now() - DAYS * 86400000;

  const snap = await db.collection("encounters")
    .where("updatedAt", ">=", new Date(sinceMs))
    .limit(5000)
    .get();

  const tokenByFlow = new Map<string, Map<string, number>>();
  const bigramByFlow = new Map<string, Map<string, number>>();
  const sampleByFlow = new Map<string, string[]>();

  let total = 0;
  let used = 0;

  for (const doc of snap.docs) {
    total++;
    const e: any = doc.data();
    const flowId = norm(e.flowId) || "UNKNOWN";

    let answersObj: any = {};
    try { answersObj = e.answers ? JSON.parse(e.answers) : {}; } catch { answersObj = {}; }

    const r = answersObj.__router || {};
    const ra = answersObj.__routerAudit || {};

    const source = norm(r.source || ra.routerReason).toLowerCase();
    if (!(source === "keyword" || source === "other_text")) continue;

    const snippet = norm(r.snippet || ra.routerTextSnippet);
    if (!snippet) continue;

    if (snippet.startsWith("/flow") || snippet.startsWith("/api/") || snippet.includes("set-flow")) continue;

    used++;

    const tokens = tokenize(snippet);
    if (!tokens.length) continue;

    if (!tokenByFlow.has(flowId)) tokenByFlow.set(flowId, new Map());
    if (!bigramByFlow.has(flowId)) bigramByFlow.set(flowId, new Map());
    if (!sampleByFlow.has(flowId)) sampleByFlow.set(flowId, []);

    const tm = tokenByFlow.get(flowId)!;
    const bm = bigramByFlow.get(flowId)!;

    for (const t of tokens) inc(tm, t);
    for (const b of bigrams(tokens)) inc(bm, b);

    const samples = sampleByFlow.get(flowId)!;
    if (samples.length < 8) samples.push(snippet.slice(0, 140));
  }

  const mdPath = path.join(OUTPUT_DIR, "router_synonyms.md");
  const lines: string[] = [];
  lines.push(`# Router Synonym Suggestions (last ${DAYS} days)`);
  lines.push(`Scanned encounters: **${total}**`);
  lines.push(`Included keyword/other_text routed: **${used}**`);
  lines.push(``);
  lines.push(`## Top tokens/bigrams by flow`);
  lines.push(`These are **candidates** to add as synonyms to improve routing precision.`);
  lines.push(``);

  const flows = Array.from(tokenByFlow.keys()).sort();
  for (const flowId of flows) {
    const topTok = topN(tokenByFlow.get(flowId)!, 15);
    const topBi = topN(bigramByFlow.get(flowId)!, 10);
    lines.push(`### ${flowId}`);
    lines.push(`**Top tokens:** ${topTok.map(([k,v]) => `${k}(${v})`).join(", ")}`);
    lines.push(`**Top bigrams:** ${topBi.map(([k,v]) => `${k}(${v})`).join(", ")}`);
    lines.push(`**Samples:**`);
    for (const s of (sampleByFlow.get(flowId) || [])) lines.push(`- "${s}"`);
    lines.push(``);
  }

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  const jsonPath = path.join(OUTPUT_DIR, "router_synonyms_seed.json");
  const seed: any = {};
  for (const flowId of flows) {
    seed[flowId] = {
      tokens: topN(tokenByFlow.get(flowId)!, 50),
      bigrams: topN(bigramByFlow.get(flowId)!, 30),
    };
  }
  fs.writeFileSync(jsonPath, JSON.stringify(seed, null, 2), "utf8");

  console.log(`Wrote: ${mdPath}`);
  console.log(`Wrote: ${jsonPath}`);
}

main().catch((e) => {
  console.error("generateRouterSynonymSuggestions failed:", e);
  process.exit(1);
});
