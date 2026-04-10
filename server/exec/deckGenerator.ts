import fs from "fs";
import path from "path";

export interface DeckMetrics {
  patients:           number;
  erRate:             number;
  accuracy:           number;
  p95Latency:         number;
  safetyMismatchRate: number;
  uptime:             number;
}

export function generateDeckMarkdown(metrics: DeckMetrics): string {
  return `# Auralyn Clinical Intelligence Platform

## Vision
AI-driven global healthcare operating system — enabling 1 physician to manage 500+ patients/day.

## Product
- 66-layer clinical knowledge base
- Safety-first three-tier triage (ambient → standard → ER)
- Automation + self-healing orchestration
- Global multi-region intelligence layer
- HIPAA/FDA-aligned audit chain

## Performance
- Patients/day: ${metrics.patients.toLocaleString()}
- Real-time safety enforcement — hard ER_NOW gate never bypassed
- Decision latency: P95 ${metrics.p95Latency}ms (target: <1,500ms)
- Clinical accuracy: ${(metrics.accuracy * 100).toFixed(1)}%

## Safety Record
- Safety mismatch rate: ${(metrics.safetyMismatchRate * 100).toFixed(2)}% (threshold: <2%)
- Hard safety gate: ER_NOW always synchronous and blocking
- RLHF improvement proposals require physician approval
- Immutable SHA-256-anchored audit log
- Global safety kill switch at 2% mismatch rate

## Market
- Phase 1: NYC urgent care centers (500+ patients/day each)
- Phase 2: Telemed platforms
- Phase 3: Regional health systems
- Phase 4: Enterprise hospital networks

## Moat
- Proprietary 66-layer clinical KB (not LLM-dependent)
- Golden case library with regression blocking
- Multi-agent consensus reasoning
- Cross-region federated learning
- Self-healing automation templates

## Metrics
- Uptime: ${(metrics.uptime * 100).toFixed(2)}%
- ER escalation rate: ${(metrics.erRate * 100).toFixed(1)}%

## Regulatory Pathway
- Class II — SaMD (Software as Medical Device)
- Decision Support (not autonomous diagnosis)
- HIPAA-compliant data handling
- FDA 510(k) documentation ready

## Ask
Strategic deployment + EHR partnerships + FDA clearance pathway
`;
}

export function writeDeckFile(metrics: DeckMetrics, outDir = process.cwd()): string {
  const md       = generateDeckMarkdown(metrics);
  const outPath  = path.join(outDir, "deck.md");
  fs.writeFileSync(outPath, md, "utf-8");
  return outPath;
}

export function generateDeckJson(metrics: DeckMetrics): object {
  return {
    title:       "Auralyn Clinical Intelligence Platform",
    version:     "1.0",
    generatedAt: new Date().toISOString(),
    slides: [
      { title: "Vision",      content: "AI-driven global healthcare operating system" },
      { title: "Traction",    content: `${metrics.patients.toLocaleString()} patients/day | ${(metrics.accuracy * 100).toFixed(1)}% accuracy` },
      { title: "Safety",      content: `${(metrics.safetyMismatchRate * 100).toFixed(2)}% mismatch | P95 ${metrics.p95Latency}ms` },
      { title: "Market",      content: "NYC urgent care → Telemed → Regional systems → Enterprise" },
      { title: "Moat",        content: "66-layer KB + Golden cases + Multi-agent AI + Federated learning" },
      { title: "Regulatory",  content: "Class II SaMD | HIPAA | FDA 510(k) pathway" },
    ],
  };
}
