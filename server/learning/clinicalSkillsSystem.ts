/**
 * clinicalSkillsSystem.ts
 * server/learning/clinicalSkillsSystem.ts
 *
 * HERMES-INSPIRED CLINICAL SKILLS SYSTEM
 *
 * Every physician override is a "successful task completion" — the physician
 * saw what the AI said and knew better. Instead of just capturing the override
 * in the audit chain, this system:
 *   1. Evaluates what the AI got wrong
 *   2. Extracts the clinical reasoning that would have been correct
 *   3. Codifies it as a "Clinical Skill" — a structured markdown playbook
 *   4. Stores it for retrieval the next time a similar case appears
 *   5. Injects relevant skills into the LLM system prompt (Tier 1 memory)
 *
 * MEMORY TIERS:
 *   Tier 1 → ACTIVE_SKILLS (top 3 relevant skills, injected into system prompt)
 *   Tier 2 → PHYSICIAN_PROFILE (per-physician override patterns)
 *   Tier 3 → SKILL_ARCHIVE (Postgres full-text search, all historical skills)
 *   Tier 4 → KB rules + ontology (Win 14 layer)
 */

import Anthropic         from "@anthropic-ai/sdk";
import { db }            from "../db";
import { sql }           from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";
import * as fs           from "fs";
import * as path         from "path";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClinicalSkill {
  id:               string;
  complaintSlug:    string;
  title:            string;
  trigger:          string;
  aiTendency:       string;
  correctReasoning: string;
  evidenceBasis:    string;
  confidence:       number;
  overrideCount:    number;
  activatedAt?:     string;
  status:           "pending_review" | "active" | "retired";
  createdAt:        string;
  version:          number;
}

export interface SkillRetrievalResult {
  skills:          ClinicalSkill[];
  promptInjection: string;
  tokenEstimate:   number;
}

// ─── Filesystem storage ───────────────────────────────────────────────────────

const SKILLS_DIR = path.join(process.cwd(), ".skills");

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function skillToMarkdown(skill: ClinicalSkill): string {
  return `# Clinical Skill: ${skill.title}

**ID:** ${skill.id}
**Complaint:** ${skill.complaintSlug}
**Confidence:** ${Math.round(skill.confidence * 100)}% (${skill.overrideCount} physician overrides)
**Status:** ${skill.status}
**Version:** ${skill.version}

## When This Skill Applies
${skill.trigger}

## AI Tendency (What Gets Wrong)
${skill.aiTendency}

## Correct Clinical Reasoning
${skill.correctReasoning}

## Evidence Basis
${skill.evidenceBasis}

---
*Generated from physician override analysis. Activated: ${skill.activatedAt ?? "pending review"}*
`;
}

async function persistSkill(skill: ClinicalSkill): Promise<void> {
  ensureSkillsDir();

  fs.writeFileSync(
    path.join(SKILLS_DIR, `${skill.id}.md`),
    skillToMarkdown(skill)
  );

  await db.execute(sql`
    INSERT INTO clinical_skills (
      skill_id, complaint_slug, title, trigger_text, ai_tendency,
      correct_reasoning, evidence_basis, confidence, override_count,
      status, version, created_at
    ) VALUES (
      ${skill.id}, ${skill.complaintSlug}, ${skill.title},
      ${skill.trigger}, ${skill.aiTendency}, ${skill.correctReasoning},
      ${skill.evidenceBasis}, ${skill.confidence}, ${skill.overrideCount},
      ${skill.status}, ${skill.version}, ${skill.createdAt}
    )
    ON CONFLICT (skill_id) DO UPDATE SET
      title             = ${skill.title},
      trigger_text      = ${skill.trigger},
      ai_tendency       = ${skill.aiTendency},
      correct_reasoning = ${skill.correctReasoning},
      evidence_basis    = ${skill.evidenceBasis},
      confidence        = ${skill.confidence},
      override_count    = ${skill.overrideCount},
      status            = ${skill.status},
      version           = ${skill.version}
  `).catch(console.error);
}

// ─── Skill generator ──────────────────────────────────────────────────────────

export async function generateSkillFromOverrides(overrideData: {
  complaintSlug:    string;
  overrideCount:    number;
  overrideRate:     number;
  aiOutputSamples:  string[];
  physicianActions: string[];
  timeframe:        string;
}): Promise<ClinicalSkill | null> {

  if (overrideData.overrideCount < 3) return null;

  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 1500,
    system: `You are generating a Clinical Skill document for Auralyn, an urgent care AI triage system.
A Clinical Skill is a concise, actionable playbook that corrects a known AI reasoning failure.

The skill will be injected into the AI's system prompt to prevent future errors.
It must be:
- Specific (not vague clinical advice)
- Actionable (the AI must know exactly what to do differently)
- Evidence-based (grounded in clinical guidelines)
- Concise (the entire skill injects as <200 tokens)

Return ONLY valid JSON matching the ClinicalSkill structure. No markdown.`,
    messages: [{
      role:    "user",
      content: `Generate a Clinical Skill from this override pattern:

Complaint: ${overrideData.complaintSlug}
Override rate: ${Math.round(overrideData.overrideRate * 100)}% of cases (${overrideData.overrideCount} overrides)
Timeframe: ${overrideData.timeframe}

AI outputs that were overridden:
${overrideData.aiOutputSamples.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n")}

Physician corrections:
${overrideData.physicianActions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n")}

Return JSON:
{
  "title": "short skill name",
  "trigger": "when does this skill apply (1-2 sentences)",
  "aiTendency": "what the AI typically gets wrong (1-2 sentences)",
  "correctReasoning": "what the AI should do instead (2-3 sentences with clinical rationale)",
  "evidenceBasis": "which guideline or clinical rule supports this (1 sentence)"
}`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();

  let parsed: any;
  try { parsed = JSON.parse(clean); }
  catch { return null; }

  const skill: ClinicalSkill = {
    id:               `skill-${overrideData.complaintSlug}-${Date.now()}`,
    complaintSlug:    overrideData.complaintSlug,
    title:            parsed.title,
    trigger:          parsed.trigger,
    aiTendency:       parsed.aiTendency,
    correctReasoning: parsed.correctReasoning,
    evidenceBasis:    parsed.evidenceBasis,
    confidence:       Math.min(0.95, overrideData.overrideRate * 1.2),
    overrideCount:    overrideData.overrideCount,
    status:           "pending_review",
    createdAt:        new Date().toISOString(),
    version:          1,
  };

  await persistSkill(skill);

  await appendAuditEvent({
    actor:      "system",
    action:     "CLINICAL_SKILL_GENERATED",
    entityId:   skill.id,
    entityType: "skill",
    details: {
      complaintSlug: skill.complaintSlug,
      overrideCount: skill.overrideCount,
      confidence:    Math.round(skill.confidence * 100),
      status:        "pending_review",
    },
  }).catch(console.error);

  return skill;
}

// ─── Skill retrieval (Tier 1 memory injection) ────────────────────────────────

export async function retrieveRelevantSkills(
  complaintSlug: string,
  maxSkills:     number = 3
): Promise<SkillRetrievalResult> {

  const rows = await db.execute(sql`
    SELECT skill_id, complaint_slug, title, trigger_text, ai_tendency,
           correct_reasoning, evidence_basis, confidence, override_count,
           status, version, created_at, activated_at
    FROM   clinical_skills
    WHERE  complaint_slug = ${complaintSlug}
      AND  status = 'active'
    ORDER  BY confidence DESC, override_count DESC
    LIMIT  ${maxSkills}
  `).catch(() => ({ rows: [] }));

  const skills: ClinicalSkill[] = (rows.rows as any[]).map(r => ({
    id:               r.skill_id,
    complaintSlug:    r.complaint_slug,
    title:            r.title,
    trigger:          r.trigger_text,
    aiTendency:       r.ai_tendency,
    correctReasoning: r.correct_reasoning,
    evidenceBasis:    r.evidence_basis,
    confidence:       r.confidence,
    overrideCount:    r.override_count,
    status:           r.status,
    activatedAt:      r.activated_at,
    createdAt:        r.created_at,
    version:          r.version,
  }));

  if (skills.length === 0) {
    return { skills: [], promptInjection: "", tokenEstimate: 0 };
  }

  const promptInjection = `
## CLINICAL SKILLS — Active Playbooks for ${complaintSlug.replace(/_/g, " ")}
These skills were generated from physician override patterns. Apply them before forming your differential.

${skills.map((s, i) => `
### Skill ${i + 1}: ${s.title} (confidence: ${Math.round(s.confidence * 100)}%)
**When:** ${s.trigger}
**AI tends to:** ${s.aiTendency}
**Instead:** ${s.correctReasoning}
**Basis:** ${s.evidenceBasis}
`).join("\n").trim()}
`.trim();

  const tokenEstimate = Math.ceil(promptInjection.length / 4);

  return { skills, promptInjection, tokenEstimate };
}

// ─── Physician approval flow ──────────────────────────────────────────────────

export async function activateSkill(skillId: string, physicianId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE clinical_skills
    SET    status = 'active', activated_at = NOW()
    WHERE  skill_id = ${skillId}
      AND  status = 'pending_review'
  `).catch(() => null);

  if (!result) return false;

  await appendAuditEvent({
    actor:      physicianId,
    action:     "CLINICAL_SKILL_ACTIVATED",
    entityId:   skillId,
    entityType: "skill",
    details:    { physicianId },
  }).catch(console.error);

  return true;
}

export async function retireSkill(skillId: string, physicianId: string, reason: string): Promise<boolean> {
  await db.execute(sql`
    UPDATE clinical_skills SET status = 'retired'
    WHERE  skill_id = ${skillId}
  `).catch(() => null);

  await appendAuditEvent({
    actor:      physicianId,
    action:     "CLINICAL_SKILL_RETIRED",
    entityId:   skillId,
    entityType: "skill",
    details:    { physicianId, reason },
  }).catch(console.error);

  return true;
}

// ─── Periodic nudge (Hermes pattern) ─────────────────────────────────────────
// Runs nightly at 3am UTC — extracts skills from high-override complaint slugs
// in the last 30 days and queues them for physician review.

export async function runPeriodicSkillNudge(): Promise<{
  skillsGenerated: number;
  skillsPending:   number;
}> {
  console.log("[SkillsSystem] Running periodic skill nudge...");

  const overrideRows = await db.execute(sql`
    SELECT
      event_data->>'complaintSlug'   AS complaint_slug,
      COUNT(*)                        AS total_cases,
      SUM(CASE WHEN event_type IN ('CASE_MODIFIED','CASE_REJECTED') THEN 1 ELSE 0 END) AS overrides
    FROM audit_hash_chain
    WHERE event_type IN ('CASE_APPROVED','CASE_MODIFIED','CASE_REJECTED')
      AND timestamp::timestamptz >= NOW() - INTERVAL '30 days'
      AND event_data->>'complaintSlug' IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) >= 5
      AND SUM(CASE WHEN event_type IN ('CASE_MODIFIED','CASE_REJECTED') THEN 1 ELSE 0 END)::float
          / COUNT(*) >= 0.20
    ORDER BY 3 DESC
    LIMIT 5
  `).catch(() => ({ rows: [] }));

  let generated = 0;
  for (const row of overrideRows.rows as any[]) {
    const slug         = row.complaint_slug;
    const overrideRate = Number(row.overrides) / Number(row.total_cases);

    const existing = await db.execute(sql`
      SELECT 1 FROM clinical_skills
      WHERE complaint_slug = ${slug}
        AND status IN ('active', 'pending_review')
        AND created_at::timestamptz >= NOW() - INTERVAL '60 days'
      LIMIT 1
    `).catch(() => ({ rows: [] }));

    if ((existing.rows as any[]).length > 0) continue;

    const skill = await generateSkillFromOverrides({
      complaintSlug:    slug,
      overrideCount:    Number(row.overrides),
      overrideRate,
      aiOutputSamples:  ["[retrieved from audit chain]"],
      physicianActions: ["[retrieved from audit chain]"],
      timeframe:        "last 30 days",
    }).catch(() => null);

    if (skill) generated++;
  }

  const pendingRows = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM clinical_skills WHERE status = 'pending_review'
  `).catch(() => ({ rows: [{ cnt: 0 }] }));

  const pending = Number((pendingRows.rows[0] as any)?.cnt ?? 0);

  console.log(`[SkillsSystem] Nudge complete: ${generated} new skills generated, ${pending} pending physician review`);
  return { skillsGenerated: generated, skillsPending: pending };
}
