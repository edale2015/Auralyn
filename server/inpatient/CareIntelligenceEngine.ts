/**
 * CareIntelligenceEngine.ts
 * Processes post-intake patient updates and monitors for disposition changes.
 * Generates physician alerts when clinical status changes after initial triage.
 * Stores updates in encounter_updates table.
 */

import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { applyPHIGuard } from "../safety/PHIGuard";
import { getComplaintPack } from "../kb/complaintPacks/index";
import type { ExtractedClinicalState } from "../kb/complaintPacks/types";

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientUpdate {
  encounterId:       string;
  patientId:         string;
  message:           string;
  channel?:          string;
  priorDisposition?: string;
  clinicalState?:    ExtractedClinicalState;
}

export interface UpdateAnalysis {
  updateType:          "symptom_worsening" | "new_symptom" | "symptom_improving" | "medication_question" | "administrative" | "red_flag";
  extractedDelta:      Record<string, any>;
  newDisposition?:     string;
  dispositionChanged:  boolean;
  physicianAlert:      boolean;
  alertReason?:        string;
  responseToPatient:   string;
  urgency:             "critical" | "high" | "routine";
}

export interface CareUpdate {
  id:               string;
  encounterId:      string;
  updatedAt:        string;
  updateType:       string;
  dispositionChanged: boolean;
  newDisposition?:  string;
  physicianAlerted: boolean;
  alertReason?:     string;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function analyzePatientUpdate(
  update: PatientUpdate
): Promise<UpdateAnalysis> {
  const safeMessage = applyPHIGuard(update.message);

  const systemPrompt = `You are a clinical AI monitoring post-triage patient updates. 
Analyze the patient message and return a JSON object:
{
  "update_type": "symptom_worsening|new_symptom|symptom_improving|medication_question|administrative|red_flag",
  "extracted_delta": { "key_clinical_changes": "..." },
  "disposition_changed": true|false,
  "new_disposition": "ER_IMMEDIATE|ER_URGENT|URGENT_CARE_TODAY|TELEHEALTH|HOME_CARE|null",
  "physician_alert": true|false,
  "alert_reason": "reason or null",
  "response_to_patient": "empathetic 1-2 sentence response",
  "urgency": "critical|high|routine"
}

RED FLAG triggers (always physician_alert=true, disposition_changed=true, new_disposition=ER_IMMEDIATE):
- Chest pain, difficulty breathing, loss of consciousness, severe pain (9-10/10), signs of stroke, heavy bleeding

Return ONLY valid JSON.`;

  const priorContext = update.priorDisposition
    ? `Prior triage disposition: ${update.priorDisposition}`
    : "";

  let analysis: UpdateAnalysis = {
    updateType:         "administrative",
    extractedDelta:     {},
    dispositionChanged: false,
    physicianAlert:     false,
    responseToPatient:  "Thank you for the update. Your care team has been notified.",
    urgency:            "routine",
  };

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${priorContext}\n\nPatient message: "${safeMessage}"`,
        },
      ],
    });

    const raw  = res.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw);

    analysis = {
      updateType:         parsed.update_type      ?? "administrative",
      extractedDelta:     parsed.extracted_delta  ?? {},
      newDisposition:     parsed.new_disposition  ?? undefined,
      dispositionChanged: Boolean(parsed.disposition_changed),
      physicianAlert:     Boolean(parsed.physician_alert),
      alertReason:        parsed.alert_reason     ?? undefined,
      responseToPatient:  parsed.response_to_patient ?? "Your care team has been notified.",
      urgency:            parsed.urgency ?? "routine",
    };
  } catch {
    // Fallback — do a simple keyword scan
    const lower = safeMessage.toLowerCase();
    const criticalKws = ["chest pain", "can't breathe", "not breathing", "unconscious", "stroke", "911", "dying"];
    if (criticalKws.some(kw => lower.includes(kw))) {
      analysis.updateType        = "red_flag";
      analysis.physicianAlert    = true;
      analysis.dispositionChanged = true;
      analysis.newDisposition    = "ER_IMMEDIATE";
      analysis.urgency           = "critical";
      analysis.alertReason       = "Critical keyword detected in patient update";
      analysis.responseToPatient = "This sounds like an emergency. Please call 911 immediately or go to the nearest ER.";
    }
  }

  return analysis;
}

// ─── DB operations ────────────────────────────────────────────────────────────

async function saveEncounterUpdate(
  update: PatientUpdate,
  analysis: UpdateAnalysis
): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO encounter_updates (
      encounter_id, patient_id, update_type, patient_message,
      extracted_delta, new_disposition, disposition_changed,
      physician_alerted, alert_reason, resolved
    ) VALUES (
      ${update.encounterId}::uuid,
      ${update.patientId}::uuid,
      ${analysis.updateType},
      ${applyPHIGuard(update.message)},
      ${JSON.stringify(analysis.extractedDelta)}::jsonb,
      ${analysis.newDisposition ?? null},
      ${analysis.dispositionChanged},
      ${analysis.physicianAlert},
      ${analysis.alertReason ?? null},
      false
    )
    RETURNING id
  `);
  return (res.rows[0] as any).id as string;
}

async function updateBriefingCard(encounterId: string, analysis: UpdateAnalysis): Promise<void> {
  if (!analysis.dispositionChanged && !analysis.physicianAlert) return;

  const newUrgency = analysis.urgency === "critical" ? "critical" :
                     analysis.urgency === "high"     ? "urgent" : "elevated";

  await db.execute(sql`
    UPDATE physician_briefing_cards SET
      urgency_signal = ${newUrgency},
      preliminary_disposition = COALESCE(${analysis.newDisposition ?? null}, preliminary_disposition),
      physician_acknowledged = false
    WHERE encounter_id = ${encounterId}::uuid
  `).catch(() => {});
}

async function createPatientSummary(encounterId: string, analysis: UpdateAnalysis): Promise<void> {
  if (!analysis.dispositionChanged) return;

  const color = analysis.urgency === "critical" ? "red" :
                analysis.urgency === "high"     ? "orange" : "yellow";

  await db.execute(sql`
    INSERT INTO patient_summaries (encounter_id, disposition, disposition_color, summary_json)
    VALUES (
      ${encounterId}::uuid,
      ${analysis.newDisposition ?? "HOME_CARE"},
      ${color},
      ${JSON.stringify({ reason: analysis.alertReason, updatedAt: new Date().toISOString() })}::jsonb
    )
    ON CONFLICT DO NOTHING
  `).catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process an inbound patient update message post-triage.
 * Returns the analysis and persisted update ID.
 */
export async function processPatientUpdate(update: PatientUpdate): Promise<{
  updateId: string;
  analysis: UpdateAnalysis;
}> {
  const analysis   = await analyzePatientUpdate(update);
  const updateId   = await saveEncounterUpdate(update, analysis);

  // Side effects
  await Promise.allSettled([
    updateBriefingCard(update.encounterId, analysis),
    createPatientSummary(update.encounterId, analysis),
  ]);

  return { updateId, analysis };
}

/**
 * Get all unresolved updates for an encounter.
 */
export async function getUnresolvedUpdates(encounterId: string): Promise<CareUpdate[]> {
  const rows = await db.execute(sql`
    SELECT id, encounter_id, updated_at, update_type, disposition_changed,
           new_disposition, physician_alerted, alert_reason
    FROM encounter_updates
    WHERE encounter_id = ${encounterId}::uuid AND resolved = false
    ORDER BY updated_at DESC
  `);
  return rows.rows as CareUpdate[];
}

/**
 * Mark an update as resolved (physician has reviewed and responded).
 */
export async function resolveUpdate(updateId: string, physicianResponse: string): Promise<void> {
  await db.execute(sql`
    UPDATE encounter_updates SET
      resolved           = true,
      physician_response = ${physicianResponse}
    WHERE id = ${updateId}::uuid
  `);
}

/**
 * Get patient-facing summary for the living encounter view.
 */
export async function getPatientSummary(shareToken: string): Promise<any | null> {
  const rows = await db.execute(sql`
    SELECT ps.*, pb.one_liner, pb.urgency_signal, pb.preliminary_disposition
    FROM patient_summaries ps
    LEFT JOIN physician_briefing_cards pb ON pb.encounter_id = ps.encounter_id
    WHERE ps.share_token = ${shareToken}
    LIMIT 1
  `);
  if (!rows.rows.length) return null;

  const row = rows.rows[0] as any;
  // Mark as viewed
  await db.execute(sql`
    UPDATE patient_summaries SET patient_viewed = true, patient_viewed_at = NOW()
    WHERE share_token = ${shareToken}
  `).catch(() => {});

  return {
    disposition:      row.disposition,
    dispositionColor: row.disposition_color,
    oneLiner:         row.one_liner,
    urgencySignal:    row.urgency_signal,
    summary:          typeof row.summary_json === "string" ? JSON.parse(row.summary_json) : (row.summary_json ?? {}),
    generatedAt:      row.generated_at,
  };
}

/**
 * Get all encounter updates for a physician dashboard view.
 */
export async function getEncounterUpdateHistory(encounterId: string): Promise<CareUpdate[]> {
  const rows = await db.execute(sql`
    SELECT id, encounter_id, updated_at, update_type, disposition_changed,
           new_disposition, physician_alerted, alert_reason, resolved
    FROM encounter_updates
    WHERE encounter_id = ${encounterId}::uuid
    ORDER BY updated_at DESC
    LIMIT 50
  `);
  return rows.rows as CareUpdate[];
}

/**
 * Get pending physician alerts across all encounters (for dashboard).
 */
export async function getPendingPhysicianAlerts(limit = 20): Promise<any[]> {
  const rows = await db.execute(sql`
    SELECT eu.id, eu.encounter_id, eu.updated_at, eu.update_type, eu.alert_reason,
           eu.new_disposition, pb.one_liner, pb.urgency_signal
    FROM encounter_updates eu
    LEFT JOIN physician_briefing_cards pb ON pb.encounter_id = eu.encounter_id
    WHERE eu.physician_alerted = true AND eu.resolved = false
    ORDER BY eu.updated_at DESC
    LIMIT ${limit}
  `);
  return rows.rows as any[];
}
