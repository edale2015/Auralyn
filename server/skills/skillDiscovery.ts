/**
 * skillDiscovery.ts — Progressive Disclosure Skill Architecture
 *
 * Article 27b (Skills Guide): "Skills use a clever three-phase loading system.
 *  Phase 1: Discovery (Always Active) — at startup, only metadata loads
 *   (~50-100 tokens per skill). This lightweight index lets Claude scan and
 *   identify relevant skills without consuming significant context.
 *  Phase 2: Deep Loading (On-Demand) — when a user request matches a Skill's
 *   description, Claude loads the full SKILL.md content.
 *  Phase 3: Reference Files — additional referenced files loaded as needed.
 *   'The amount of context is effectively unbounded. Files only cost tokens
 *   when Claude actually reads them.'"
 *
 * Degrees of Freedom (Article 27b):
 *   LOW    — fragile ops that must follow exact sequences (DB migrations, drug dosing)
 *   MEDIUM — preferred pattern, some variation acceptable (report generation)
 *   HIGH   — multiple valid approaches exist (code review, triage assessment)
 *
 * Skill grading (Article 27b):
 *   The author created a skill that grades and improves other skills.
 *   Key dimensions: conciseness, specificity, what+when description, structure depth.
 *
 * Feedback loop pattern (Article 27b):
 *   "Validate-Fix-Repeat: never proceed without validation. Catches errors
 *    immediately when context is fresh and fixes are easier."
 *
 * Clinical translation:
 *   Each clinical protocol is a skill: sepsis management, ESI triage, medication
 *   review. Metadata loads always (name + description). Full protocol only loads
 *   when the patient presentation matches. Reference files (drug interactions,
 *   dose tables, lab normals) load only when the protocol needs them.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DegreeOfFreedom = "LOW" | "MEDIUM" | "HIGH";
export type SkillType = "personal" | "project" | "plugin";
export type SkillLoadPhase = "metadata" | "content" | "references";

export interface SkillMetadata {
  id:           string;
  name:         string;      // gerund form: processing-pdfs, managing-patients
  description:  string;      // what + when formula
  type:         SkillType;
  degreeOfFreedom: DegreeOfFreedom;
  estimatedTokens: number;   // metadata-only (~50-100), content (~200-500), refs (unbounded)
  tags:         string[];
  loadPhase:    SkillLoadPhase;   // which phase this is currently at
}

export interface SkillContent {
  quickStart:    string;        // immediately available, concise
  workflowSteps: WorkflowStep[];
  feedbackLoops: FeedbackLoop[];
  referenceLinks: ReferenceLink[];
}

export interface WorkflowStep {
  order:       number;
  action:      string;
  validation?: string;   // validate-fix-repeat: run this after the step
  mandatory:   boolean;
}

export interface FeedbackLoop {
  name:       string;
  trigger:    string;        // when to start the loop
  steps:      string[];      // validate → fix steps
  exitCondition: string;     // when the loop completes
  clinical?:  boolean;       // if true, physician sign-off required
}

export interface ReferenceLink {
  label:     string;
  path:      string;        // one level deep from SKILL.md only
  loadWhen:  string;        // trigger for on-demand loading
  sizeHint:  number;        // estimated tokens if loaded
}

export interface SkillGrade {
  skillId:       string;
  overall:       number;    // 0-100
  dimensions: {
    conciseness:   number;  // Are instructions ≤ necessary tokens?
    specificity:   number;  // Does it name technologies, file types, domains?
    discovery:     number;  // Is the description what + when in third person?
    structure:     number;  // One level deep, TOC for >100 line refs?
    testability:   number;  // Does it include examples or validation steps?
    freedom:       number;  // Is degree-of-freedom appropriate for task fragility?
  };
  issues:      string[];
  suggestions: string[];
  grade:       "A" | "B" | "C" | "D" | "F";
}

export interface DiscoveryMatch {
  skill:       SkillMetadata;
  score:       number;       // 0-1 relevance score
  matchedTerms: string[];
}

export interface Skill {
  metadata:   SkillMetadata;
  content?:   SkillContent;    // loaded on Phase 2
  references: Record<string, string>;  // path → content (loaded on Phase 3)
}

// ── Skill registry ────────────────────────────────────────────────────────────

const _skills = new Map<string, Skill>();

let _seq = 1;
function nextId() { return `skill_${Date.now()}_${_seq++}`; }

// ── Token budget constants (Article 27b) ─────────────────────────────────────
// "Phase 1 metadata: ~50-100 tokens per Skill"
const METADATA_TOKEN_BUDGET = 75;

// ── Gerund name validation ────────────────────────────────────────────────────
// Article: "Use gerund form: processing-pdfs, analyzing-spreadsheets"

export function validateGerundName(name: string): { valid: boolean; reason?: string } {
  if (!/^[a-z][a-z0-9-]+$/.test(name)) return { valid: false, reason: "Must be lowercase letters, numbers, hyphens only" };
  if (name.length > 64)                 return { valid: false, reason: "Max 64 characters" };
  const parts = name.split("-");
  const firstPart = parts[0];
  // Gerund form: first word should end in -ing (processing, analyzing, managing, etc.)
  if (!firstPart.endsWith("ing")) {
    return { valid: false, reason: `Name should use gerund form (verb+ing): got '${firstPart}', try '${firstPart}ing-...'` };
  }
  return { valid: true };
}

// ── Description quality check ─────────────────────────────────────────────────
// Article: "Magic formula: Describe WHAT the Skill does AND WHEN to use it."

export function validateDescription(description: string): {
  hasWhat: boolean; hasWhen: boolean; isThirdPerson: boolean; qualityScore: number;
} {
  const hasWhat       = description.length >= 30;
  const hasWhen       = /\buse (when|for|if)\b/i.test(description);
  const isThirdPerson = !/\b(I |we |you )\b/i.test(description);

  let score = 0;
  if (hasWhat)       score += 40;
  if (hasWhen)       score += 40;
  if (isThirdPerson) score += 20;

  return { hasWhat, hasWhen, isThirdPerson, qualityScore: score };
}

// ── Degrees of freedom ────────────────────────────────────────────────────────
// Article: "Match instruction specificity to the task's error tolerance."

export const FREEDOM_PROFILES: Record<DegreeOfFreedom, {
  label:        string;
  analogy:      string;
  instructionStyle: string;
  exampleDomains: string[];
}> = {
  LOW: {
    label:            "LOW",
    analogy:          "Narrow bridge with cliffs — needs specific guardrails",
    instructionStyle: "Exact scripts, few/no parameters, mandatory sequences, ALWAYS keywords",
    exampleDomains:   ["Drug dosing calculations", "Database migrations", "Antibiotic allergy checks", "STAT order execution"],
  },
  MEDIUM: {
    label:            "MEDIUM",
    analogy:          "Marked trail through woods — preferred path, detours won't cause problems",
    instructionStyle: "Pseudocode or templates with configurable parameters, preferred patterns",
    exampleDomains:   ["Clinical report generation", "Discharge summary drafting", "Medication reconciliation", "Radiology order selection"],
  },
  HIGH: {
    label:            "HIGH",
    analogy:          "Wide open field — multiple valid approaches exist",
    instructionStyle: "Text-based heuristics with multiple valid paths, 'adapt based on what you find', examples over rules",
    exampleDomains:   ["Code review", "Clinical triage assessment", "Differential diagnosis brainstorm", "Treatment alternative exploration"],
  },
};

// ── Phase 1: Register skill (metadata only) ───────────────────────────────────

export function registerSkill(
  name:            string,
  description:     string,
  type:            SkillType,
  degreeOfFreedom: DegreeOfFreedom,
  tags:            string[] = [],
): Skill {
  const id = nextId();
  const metadata: SkillMetadata = {
    id, name, description, type, degreeOfFreedom,
    estimatedTokens: METADATA_TOKEN_BUDGET,
    tags,
    loadPhase: "metadata",
  };
  const skill: Skill = { metadata, references: {} };
  _skills.set(id, skill);
  return skill;
}

// ── Phase 2: Load content ─────────────────────────────────────────────────────

export function loadSkillContent(skillId: string, content: SkillContent): Skill | null {
  const skill = _skills.get(skillId);
  if (!skill) return null;
  skill.content = content;
  skill.metadata.loadPhase      = "content";
  skill.metadata.estimatedTokens = 350;  // ~200-500 for content
  return skill;
}

// ── Phase 3: Load reference file ──────────────────────────────────────────────
// Article: "Files only cost tokens when Claude actually reads them."
// Constraint: "Keep it ONE level deep — Claude should never need to follow more than one link"

export function loadReferenceFile(skillId: string, path: string, content: string): boolean {
  const skill = _skills.get(skillId);
  if (!skill) return false;
  // One-level-deep validation
  const pathDepth = path.split("/").filter(Boolean).length;
  if (pathDepth > 2) {
    throw new Error(`Reference file '${path}' is too deep (${pathDepth} levels). Max 2 levels (skill/file). Article anti-pattern: SKILL.md → advanced.md → details.md creates navigation overhead.`);
  }
  skill.references[path] = content;
  skill.metadata.loadPhase = "references";
  return true;
}

// ── Discovery engine ──────────────────────────────────────────────────────────
// Article: "Phase 1 — Claude scans metadata to identify relevant Skills without
//  consuming significant context."

export function discoverSkills(userRequest: string, maxResults = 5): DiscoveryMatch[] {
  const requestLower    = userRequest.toLowerCase();
  const requestTerms    = requestLower.split(/\W+/).filter((t) => t.length > 3);
  const matches: DiscoveryMatch[] = [];

  for (const skill of _skills.values()) {
    const nameWords = skill.metadata.name.replace(/-/g, " ").toLowerCase();
    const descWords = skill.metadata.description.toLowerCase();
    const tagWords  = skill.metadata.tags.join(" ").toLowerCase();
    const target    = `${nameWords} ${descWords} ${tagWords}`;

    const matched = requestTerms.filter((term) => target.includes(term));
    if (matched.length === 0) continue;

    const score = matched.length / Math.max(requestTerms.length, 1);
    matches.push({ skill: skill.metadata, score, matchedTerms: matched });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── Skill grading system ──────────────────────────────────────────────────────
// Article: "I created a skill that grades and improves my skills."

export function gradeSkill(skillId: string): SkillGrade | null {
  const skill = _skills.get(skillId);
  if (!skill) return null;

  const meta = skill.metadata;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Dimension 1: Conciseness (description token cost)
  const descTokens      = Math.ceil(meta.description.length / 4);
  const conciseness     = descTokens <= 100 ? 100 : descTokens <= 200 ? 70 : 40;
  if (descTokens > 200) {
    issues.push(`Description is ${descTokens} tokens. Target ≤ 100.`);
    suggestions.push("Trim description. Only add context the agent doesn't already have.");
  }

  // Dimension 2: Specificity (names technologies, file types, domains)
  const hasSpecificTerms = /\b(\w+\.\w+|\w+API|\w+DB|\w+-\w+|ESI|NEWS2|qSOFA|ICD|CPT)\b/.test(meta.description);
  const specificity      = hasSpecificTerms ? 90 : 50;
  if (!hasSpecificTerms) {
    issues.push("Description lacks specific technology or domain terms.");
    suggestions.push("Name the specific clinical domains, tools, or file types this skill handles.");
  }

  // Dimension 3: Discovery (what + when)
  const { hasWhat, hasWhen, isThirdPerson, qualityScore: descScore } = validateDescription(meta.description);
  const discovery = descScore;
  if (!hasWhen)       { issues.push("Description missing 'Use when' trigger."); suggestions.push("Add: 'Use when [condition].'"); }
  if (!isThirdPerson) { issues.push("Description not in third person."); suggestions.push("Write in third person — it's injected into the system prompt."); }

  // Dimension 4: Structure (content loaded? references one level deep?)
  let structure = 50;
  if (skill.content) structure += 25;
  if (Object.keys(skill.references).length > 0) {
    const deepRefs = Object.keys(skill.references).filter((p) => p.split("/").filter(Boolean).length > 2);
    if (deepRefs.length === 0) structure += 25;
    else {
      issues.push(`${deepRefs.length} reference file(s) are too deep (>2 levels). Anti-pattern.`);
      suggestions.push("Keep references one level deep from SKILL.md.");
    }
  }

  // Dimension 5: Testability (workflow has validation steps)
  const hasValidation = skill.content?.workflowSteps.some((s) => s.validation) ?? false;
  const hasFeedback   = (skill.content?.feedbackLoops.length ?? 0) > 0;
  const testability   = hasValidation || hasFeedback ? 90 : 40;
  if (!hasValidation && !hasFeedback) {
    suggestions.push("Add validation steps or feedback loops. 'Validate-Fix-Repeat' reduces broken outputs by 70-90%.");
  }

  // Dimension 6: Freedom appropriateness
  const nameValidation = validateGerundName(meta.name);
  const freedom        = nameValidation.valid ? 90 : 50;
  if (!nameValidation.valid) {
    issues.push(`Name '${meta.name}': ${nameValidation.reason}`);
    suggestions.push("Use gerund form: processing-records, managing-patients, analyzing-vitals");
  }

  const overall = Math.round((conciseness + specificity + discovery + structure + testability + freedom) / 6);
  const grade: "A" | "B" | "C" | "D" | "F" =
    overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 45 ? "D" : "F";

  return {
    skillId,
    overall,
    dimensions: { conciseness, specificity, discovery, structure, testability, freedom },
    issues,
    suggestions,
    grade,
  };
}

// ── Feedback loop builder ─────────────────────────────────────────────────────
// Article: "Validate-Fix-Repeat dramatically improves output quality. Teams
//  using feedback loops report 70-90% fewer broken outputs."

export function buildFeedbackLoop(
  name:          string,
  trigger:       string,
  validateStep:  string,
  fixStep:       string,
  exitCondition: string,
  clinical = false,
): FeedbackLoop {
  return {
    name,
    trigger,
    steps: [validateStep, fixStep],
    exitCondition,
    clinical,
  };
}

// ── Query API ─────────────────────────────────────────────────────────────────

export function getSkill(id: string): Skill | undefined          { return _skills.get(id); }
export function listAllSkillMetadata(): SkillMetadata[]          { return Array.from(_skills.values()).map((s) => s.metadata); }
export function getFreedomProfile(dof: DegreeOfFreedom)          { return FREEDOM_PROFILES[dof]; }

// Pre-seed with clinical examples
function seedClinicalSkills(): void {
  const s1 = registerSkill(
    "managing-sepsis-protocol",
    "Executes the Hour-1 Surviving Sepsis Campaign bundle: blood cultures, antibiotics, crystalloid bolus, lactate measurement. Use when patient has suspected sepsis, qSOFA ≥ 2, or lactate > 2 mmol/L.",
    "project", "LOW",
    ["sepsis", "critical care", "Hour-1 bundle", "antibiotics"],
  );
  loadSkillContent(s1.metadata.id, {
    quickStart: "1. Order blood cultures × 2. 2. Administer broad-spectrum antibiotics. 3. Administer 30mL/kg crystalloid. 4. Measure lactate. 5. Reassess MAP at 1 hour.",
    workflowSteps: [
      { order: 1, action: "Order blood cultures × 2 before antibiotics", validation: "Confirm cultures ordered in EHR", mandatory: true },
      { order: 2, action: "Administer broad-spectrum antibiotics within 1 hour", validation: "MAR shows antibiotic administered within 60 min", mandatory: true },
      { order: 3, action: "Administer 30mL/kg IV crystalloid", validation: "Nursing documents bolus start time and volume", mandatory: true },
      { order: 4, action: "Measure lactate", validation: "Lab result in EHR < 2 hours from order", mandatory: true },
      { order: 5, action: "Reassess MAP and clinical status", validation: "Physician documents reassessment note", mandatory: true },
    ],
    feedbackLoops: [
      buildFeedbackLoop(
        "MAP reassessment loop",
        "After crystalloid bolus, if MAP < 65",
        "Measure MAP 30 minutes after bolus completion",
        "If MAP < 65 and unresponsive to fluids, initiate vasopressors (norepinephrine first-line)",
        "MAP ≥ 65 and patient stable",
        true,
      ),
    ],
    referenceLinks: [
      { label: "Antibiotic selection guide", path: "reference/antibiotics.md", loadWhen: "antibiotic choice is uncertain", sizeHint: 400 },
      { label: "Lactate interpretation", path: "reference/lactate.md", loadWhen: "lactate > 4 mmol/L", sizeHint: 200 },
    ],
  });

  registerSkill(
    "triaging-esi-patients",
    "Assigns Emergency Severity Index (ESI) levels 1-5 based on chief complaint, vital signs, and resource prediction. Use when patient arrives at the emergency department triage desk.",
    "project", "MEDIUM",
    ["triage", "ESI", "emergency", "acuity"],
  );

  registerSkill(
    "reviewing-medication-orders",
    "Reviews physician medication orders for drug interactions, allergy contraindications, dose appropriateness, and formulary compliance. Use when a new drug order is placed or existing order is modified.",
    "project", "LOW",
    ["medications", "drug interactions", "pharmacy", "allergy"],
  );
}

seedClinicalSkills();
