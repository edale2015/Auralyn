import * as fs from "fs/promises";
import * as path from "path";

const REGISTRY_FILE = path.join("data", "locked_safety_registry.json");

export interface LockedSafetyRule {
  id: string;
  complaint: string;
  trigger_features: string[];
  mandatory_disposition: "er_now";
  rationale: string;
  version: string;
  locked_at: string;
  locked_by: string;
  immutable: true;
  audit_hash: string;
}

export interface RegistryMeta {
  version: string;
  locked_at: string;
  total_rules: number;
  complaints_covered: number;
  note: string;
}

export interface SafetyRegistry {
  meta: RegistryMeta;
  rules: LockedSafetyRule[];
}

function hashRule(rule: Omit<LockedSafetyRule, "audit_hash">): string {
  const str = [rule.id, rule.complaint, rule.trigger_features.sort().join(","), rule.mandatory_disposition, rule.rationale].join("|");
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

const SEED_RULES: Omit<LockedSafetyRule, "audit_hash">[] = [
  { id: "SR-001", complaint: "chest_pain",     trigger_features: ["radiates_left_arm"],        mandatory_disposition: "er_now", rationale: "Radiation to left arm is a cardinal sign of ACS. Life-threatening if missed.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-002", complaint: "chest_pain",     trigger_features: ["diaphoresis"],              mandatory_disposition: "er_now", rationale: "Diaphoresis with chest pain strongly suggests acute myocardial infarction.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-003", complaint: "chest_pain",     trigger_features: ["shortness_of_breath"],      mandatory_disposition: "er_now", rationale: "Chest pain with dyspnea: PE, ACS, or tension pneumothorax must be excluded emergently.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-004", complaint: "sore_throat",    trigger_features: ["drooling"],                 mandatory_disposition: "er_now", rationale: "Drooling indicates inability to manage secretions — epiglottitis or peritonsillar abscess with airway compromise.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-005", complaint: "sore_throat",    trigger_features: ["muffled_voice"],            mandatory_disposition: "er_now", rationale: "Hot potato voice indicates peritonsillar abscess or deep neck infection. Airway at risk.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-006", complaint: "headache",       trigger_features: ["worst_headache"],           mandatory_disposition: "er_now", rationale: "Thunderclap / worst-ever headache must be treated as subarachnoid hemorrhage until proven otherwise.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-007", complaint: "headache",       trigger_features: ["neck_stiffness"],           mandatory_disposition: "er_now", rationale: "Headache + neck stiffness = meningitis until proven otherwise. Delay = death.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-008", complaint: "headache",       trigger_features: ["confusion"],                mandatory_disposition: "er_now", rationale: "Headache + altered consciousness: hemorrhage, encephalitis, or herniation.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-009", complaint: "abdominal_pain", trigger_features: ["vaginal_bleeding","positive_pregnancy_test"], mandatory_disposition: "er_now", rationale: "Abdominal pain + positive pregnancy test + bleeding = ectopic until proven otherwise. Potentially fatal.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-010", complaint: "abdominal_pain", trigger_features: ["abdominal_rigidity"],       mandatory_disposition: "er_now", rationale: "Board-like rigidity suggests peritonitis or perforated viscus — surgical emergency.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-011", complaint: "fever",          trigger_features: ["neck_stiffness","petechiae"], mandatory_disposition: "er_now", rationale: "Fever + petechiae + neck stiffness = meningococcemia. Highest-urgency medical emergency.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-012", complaint: "fever",          trigger_features: ["confusion"],                mandatory_disposition: "er_now", rationale: "Fever + confusion = septic encephalopathy or CNS infection. Sepsis protocol required.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-013", complaint: "rash",           trigger_features: ["petechiae"],                mandatory_disposition: "er_now", rationale: "Non-blanching petechial rash = meningococcemia until proven otherwise. Minutes matter.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-014", complaint: "cough",          trigger_features: ["hypoxia"],                  mandatory_disposition: "er_now", rationale: "Hypoxia with cough = respiratory failure risk. Immediate O2 assessment required.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-015", complaint: "dizziness",      trigger_features: ["confusion"],                mandatory_disposition: "er_now", rationale: "Dizziness + confusion in elderly: posterior stroke or vertebrobasilar event until proven otherwise.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-016", complaint: "anxiety",        trigger_features: ["tachycardia","shortness_of_breath","recent_immobility"], mandatory_disposition: "er_now", rationale: "Classic PE masquerade: anxiety + tachycardia + SOB after immobility. Wells score required.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-017", complaint: "anxiety",        trigger_features: ["tachycardia","unilateral_leg_swelling"], mandatory_disposition: "er_now", rationale: "DVT-PE axis: tachycardia + unilateral leg swelling cannot be dismissed as anxiety.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-018", complaint: "syncope",        trigger_features: ["chest_tightness"],          mandatory_disposition: "er_now", rationale: "Syncope + chest symptoms = cardiac arrhythmia or structural heart disease. ECG mandatory.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-019", complaint: "back_pain",      trigger_features: ["tachycardia","diaphoresis"], mandatory_disposition: "er_now", rationale: "Tearing back pain + tachycardia + diaphoresis = aortic dissection until proven otherwise.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
  { id: "SR-020", complaint: "shortness_of_breath", trigger_features: ["tachycardia","pleuritic_pain"], mandatory_disposition: "er_now", rationale: "SOB + tachycardia + pleuritic pain = pulmonary embolism rule-out mandatory.", version: "1.0.0", locked_at: "2025-01-01T00:00:00Z", locked_by: "clinical-governance", immutable: true },
];

function buildRegistry(): SafetyRegistry {
  const rules: LockedSafetyRule[] = SEED_RULES.map(r => ({
    ...r,
    audit_hash: hashRule(r),
  }));
  return {
    meta: {
      version: "1.0.0",
      locked_at: "2025-01-01T00:00:00Z",
      total_rules: rules.length,
      complaints_covered: [...new Set(rules.map(r => r.complaint))].length,
      note: "These rules are immutable. No AI learning process may modify them. Changes require a clinical governance review and version bump.",
    },
    rules,
  };
}

let _registry: SafetyRegistry | null = null;

export async function getLockedRegistry(): Promise<SafetyRegistry> {
  if (_registry) return _registry;
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf8");
    _registry = JSON.parse(raw);
  } catch {
    _registry = buildRegistry();
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(_registry, null, 2), "utf8");
  }
  return _registry!;
}

export async function checkLockedRules(complaint: string, features: string[]): Promise<{
  triggered: boolean;
  rules: LockedSafetyRule[];
  disposition: "er_now" | null;
  reason: string;
}> {
  const registry = await getLockedRegistry();
  const featureSet = new Set(features.map(f => f.toLowerCase().replace(/\s+/g, "_")));
  const triggered: LockedSafetyRule[] = [];

  for (const rule of registry.rules) {
    if (rule.complaint !== complaint && rule.complaint !== "universal") continue;
    const allMatch = rule.trigger_features.every(tf => featureSet.has(tf));
    const anyMatch = rule.trigger_features.some(tf => featureSet.has(tf));
    if (rule.trigger_features.length === 1 ? anyMatch : allMatch) {
      triggered.push(rule);
    }
  }

  return {
    triggered: triggered.length > 0,
    rules: triggered,
    disposition: triggered.length > 0 ? "er_now" : null,
    reason: triggered.length > 0
      ? triggered.map(r => `[${r.id}] ${r.rationale}`).join(" | ")
      : "",
  };
}

export async function verifyRuleIntegrity(): Promise<{ valid: boolean; violations: string[] }> {
  const registry = await getLockedRegistry();
  const violations: string[] = [];
  for (const rule of registry.rules) {
    const expected = hashRule(rule);
    if (rule.audit_hash !== expected) {
      violations.push(`Rule ${rule.id} hash mismatch — possible tampering detected.`);
    }
  }
  return { valid: violations.length === 0, violations };
}
