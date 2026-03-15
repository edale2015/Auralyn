import fs from 'node:fs';
import path from 'node:path';
import type { ResearchSource } from './types/researchTypes';

const REGISTRY_FILE = path.join(process.cwd(), 'research_sources.ndjson');
const inMemory: Record<string, ResearchSource> = {};

// ── Preload from disk on first import ────────────────────────────────────────
(function init() {
  if (!fs.existsSync(REGISTRY_FILE)) return;
  fs.readFileSync(REGISTRY_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .forEach((l) => {
      try { const s = JSON.parse(l) as ResearchSource; inMemory[s.id] = s; } catch {}
    });
})();

export function registerSource(source: Omit<ResearchSource, 'addedAt'>): ResearchSource {
  const entry: ResearchSource = { ...source, addedAt: new Date().toISOString() };
  inMemory[entry.id] = entry;
  fs.appendFileSync(REGISTRY_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

export function listSources(): ResearchSource[] {
  return Object.values(inMemory).filter((s) => s.active);
}

export function listAllSources(): ResearchSource[] {
  return Object.values(inMemory);
}

export function getSource(id: string): ResearchSource | undefined {
  return inMemory[id];
}

export function deactivateSource(id: string): boolean {
  if (!inMemory[id]) return false;
  inMemory[id].active = false;
  _rewrite();
  return true;
}

export function getSourcesByTier(tier: 1 | 2 | 3 | 4): ResearchSource[] {
  return listSources().filter((s) => s.authorityTier === tier);
}

export function getSourcesByDomain(domain: ResearchSource['domain']): ResearchSource[] {
  return listSources().filter((s) => s.domain === domain);
}

function _rewrite() {
  const lines = Object.values(inMemory).map((s) => JSON.stringify(s)).join('\n');
  fs.writeFileSync(REGISTRY_FILE, lines + '\n');
}

// Seed a few authority tier-1 sources if none exist
export function seedDefaultSources(): void {
  if (Object.keys(inMemory).length > 0) return;
  const defaults: Omit<ResearchSource, 'addedAt'>[] = [
    { id: 'uptodate', title: 'UpToDate Clinical Decision Support', sourceType: 'review', authorityTier: 1, domain: 'clinical_rule', url: 'https://www.uptodate.com', addedBy: 'system', requiresHumanReview: false, active: true, description: 'Evidence-based clinical decision support covering adult and pediatric medicine' },
    { id: 'cochrane', title: 'Cochrane Library Systematic Reviews', sourceType: 'review', authorityTier: 1, domain: 'clinical_rule', url: 'https://www.cochranelibrary.com', addedBy: 'system', requiresHumanReview: false, active: true, description: 'Gold-standard systematic reviews of healthcare interventions' },
    { id: 'ahrq', title: 'AHRQ Clinical Practice Guidelines', sourceType: 'guideline', authorityTier: 1, domain: 'clinical_rule', url: 'https://www.ahrq.gov', addedBy: 'system', requiresHumanReview: false, active: true, description: 'US Agency for Healthcare Research and Quality evidence-based guidelines' },
    { id: 'who', title: 'WHO Clinical Guidelines', sourceType: 'guideline', authorityTier: 1, domain: 'clinical_rule', url: 'https://www.who.int', addedBy: 'system', requiresHumanReview: false, active: true, description: 'World Health Organization global clinical standards' },
    { id: 'patient_forum_reddit', title: 'Patient Forums (Reddit Health)', sourceType: 'forum', authorityTier: 4, domain: 'patient_language', url: 'https://reddit.com/r/medical', addedBy: 'system', requiresHumanReview: true, active: true, description: 'Patient-reported experiences — informational only, not clinical rules' },
  ];
  defaults.forEach((s) => registerSource(s));
}
