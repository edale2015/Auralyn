/**
 * CROSS-CUTTING — Claude Rec: Patient Consent Capture
 *
 * HIPAA requires documentation of patient consent for AI-assisted triage.
 * Without a consent record, the organization has no evidence that:
 *   1. The patient was informed an AI was involved in their triage
 *   2. The patient agreed to their symptom data being processed
 *   3. The consent text shown meets HIPAA minimum required elements
 *
 * This module captures, stores, and exposes consent records.
 * No PHI is stored — only the consent interaction metadata.
 */

import { randomUUID } from "crypto";
import { auditStep, createTraceId } from "../audit/auditLogger";
import { logger } from "../utils/logger";

export type ConsentMethod = "explicit_checkbox" | "reply_yes" | "implicit_by_use";
export type ConsentChannel = "whatsapp" | "telegram" | "web" | "sms" | "voice";

export interface PatientConsentRecord {
  consentId:      string;
  sessionId:      string;
  consentGivenAt: string;
  consentVersion: string;   // version of consent text (semver)
  channel:        ConsentChannel;
  consentMethod:  ConsentMethod;
  consentText:    string;   // exact text shown to patient
  ipAddressHash?: string;   // SHA-256 hash only — never raw IP
  language:       string;   // ISO 639-1 language code
  expiresAt:      string;   // consent expires after 12 months — must re-consent
}

// Current consent text versions by language
export const CONSENT_TEXT_VERSIONS: Record<string, { version: string; text: string }> = {
  en: {
    version: "1.2.0",
    text: "This service uses an AI assistant to help assess your symptoms and suggest next steps. Your responses will be reviewed by a licensed physician before any clinical recommendation is made. This is not a substitute for emergency care. If you are having a medical emergency, call 911 immediately. By continuing, you agree to these terms.",
  },
  es: {
    version: "1.2.0",
    text: "Este servicio utiliza un asistente de IA para evaluar sus síntomas y sugerir los próximos pasos. Sus respuestas serán revisadas por un médico licenciado antes de que se haga cualquier recomendación clínica. Esto no sustituye la atención de emergencia. Si tiene una emergencia médica, llame al 911 de inmediato. Al continuar, acepta estos términos.",
  },
};

// In-memory consent store (keyed by sessionId)
const consentStore = new Map<string, PatientConsentRecord>();

/**
 * Records patient consent for an intake session.
 * Must be called at the start of every intake before any symptom processing.
 *
 * @param sessionId  Hashed session identifier (no PHI)
 * @param channel    WhatsApp / Telegram / Web etc.
 * @param method     How consent was captured
 * @param language   Patient language code (defaults to "en")
 */
export async function recordPatientConsent(params: {
  sessionId:      string;
  channel:        ConsentChannel;
  method:         ConsentMethod;
  language?:      string;
  ipAddressHash?: string;
}): Promise<PatientConsentRecord> {
  const lang        = params.language ?? "en";
  const consentDef  = CONSENT_TEXT_VERSIONS[lang] ?? CONSENT_TEXT_VERSIONS.en;
  const consentId   = randomUUID();
  const now         = new Date();
  const expiresAt   = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const record: PatientConsentRecord = {
    consentId,
    sessionId:      params.sessionId,
    consentGivenAt: now.toISOString(),
    consentVersion: consentDef.version,
    channel:        params.channel,
    consentMethod:  params.method,
    consentText:    consentDef.text,
    ipAddressHash:  params.ipAddressHash,
    language:       lang,
    expiresAt,
  };

  consentStore.set(params.sessionId, record);

  const traceId = createTraceId();
  await auditStep({
    traceId,
    step:     "PATIENT_CONSENT_RECORDED",
    input:    { sessionId: params.sessionId, channel: params.channel, method: params.method, language: lang },
    output:   { consentId, consentVersion: consentDef.version, expiresAt },
    metadata: { storedSeparately: true },
  });

  logger.info("patient_consent_recorded", {
    consentId, channel: params.channel, method: params.method, language: lang,
  });

  return record;
}

/**
 * Returns the consent record for a session.
 * Returns null if no consent has been recorded or if consent has expired.
 */
export function getConsentRecord(sessionId: string): PatientConsentRecord | null {
  const record = consentStore.get(sessionId);
  if (!record) return null;

  if (new Date(record.expiresAt) < new Date()) {
    consentStore.delete(sessionId);
    return null;
  }

  return record;
}

/**
 * Returns true if valid (non-expired) consent exists for this session.
 * Use as a pre-flight check before processing any patient intake.
 */
export function hasValidConsent(sessionId: string): boolean {
  return getConsentRecord(sessionId) !== null;
}

export function getConsentSummary(): {
  totalConsentRecords: number;
  byChannel:           Record<ConsentChannel, number>;
  byMethod:            Record<ConsentMethod, number>;
} {
  const records = Array.from(consentStore.values());
  const byChannel = {} as Record<ConsentChannel, number>;
  const byMethod  = {} as Record<ConsentMethod, number>;

  for (const r of records) {
    byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
    byMethod[r.method]   = (byMethod[r.method]   ?? 0) + 1;
  }

  return { totalConsentRecords: records.length, byChannel, byMethod };
}
