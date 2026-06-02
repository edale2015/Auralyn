// End-of-conversation physician packet.
//
// Called ONCE per conversation, after the streaming agent has closed the
// interview with the fixed handoff message. This is the only database read
// in the entire conversation lifecycle — it pulls the differentials, labs,
// imaging, treatments, and ICD-10 codes for the matched complaint and emits
// a single review card for the physician queue.
//
// PHYSICIAN-REVIEW RULE: nothing in this packet is sent to the patient. The
// physician sees this packet alongside the conversation transcript and
// decides the disposition.

import Anthropic from "@anthropic-ai/sdk";
import { getClinicalKnowledge, type ClinicalKnowledge } from "./knowledge/registry";
import type { AgentSession } from "./streamingAgent";
import { sendWhatsAppMessage } from "../send";
import { appendAuditEvent } from "../../audit/hashChain";
import type { DispositionCanonical } from "../../ontology/clinicalOntology";

export interface PhysicianPacket {
  caseId:         string;
  slug:           string;
  display:        string;
  transcript:     Array<{ role: "user" | "assistant"; content: string }>;
  knowledge:      ClinicalKnowledge;
  closeReason:    AgentSession["closeReason"];
  startedAt:      number;
  closedAt:       number;
  durationMs:     number;
  notes:          string[];
}

export interface BuildPhysicianPacketInput {
  caseId:  string;
  session: AgentSession;
}

/**
 * Build the physician-review packet for a finished conversation.
 *
 * Exactly one knowledge lookup. No LLM call, no field extraction, no rule
 * engine — those decisions belong to the physician. The packet is a faithful
 * record (transcript + clinical reference material) that the physician uses
 * to choose a disposition.
 */
export function buildPhysicianPacket(input: BuildPhysicianPacketInput): PhysicianPacket | null {
  const { caseId, session } = input;
  const knowledge = getClinicalKnowledge(session.slug);
  if (!knowledge) {
    console.warn(`[PhysicianPacket] no clinical knowledge for slug "${session.slug}"`);
    return null;
  }

  const closedAt   = session.closedAt ?? Date.now();
  const durationMs = closedAt - session.startedAt;

  const notes: string[] = [...knowledge.physicianNotes];
  if (session.closeReason === "max_turns") {
    notes.push("Interview reached the maximum turn cap (15 patient messages) before the model closed it.");
  }

  return {
    caseId,
    slug:        session.slug,
    display:     knowledge.display,
    transcript:  session.exchanges.slice(),
    knowledge,
    closeReason: session.closeReason,
    startedAt:   session.startedAt,
    closedAt,
    durationMs,
    notes,
  };
}

/**
 * Format the packet as a single string suitable for the physician queue UI's
 * note field. Keeps the patient transcript first (the human-readable part)
 * then the clinical reference appended below.
 */
export function formatPhysicianPacket(packet: PhysicianPacket): string {
  const lines: string[] = [];
  lines.push(`Chief complaint: ${packet.display}`);
  lines.push(`Case ID: ${packet.caseId}`);
  lines.push(`Interview duration: ${Math.round(packet.durationMs / 1000)}s, close reason: ${packet.closeReason ?? "unknown"}`);
  lines.push("");
  lines.push("─── Transcript ───");
  for (const turn of packet.transcript) {
    const speaker = turn.role === "user" ? "Patient" : "Auralyn";
    lines.push(`${speaker}: ${turn.content}`);
  }
  lines.push("");
  lines.push("─── Differentials ───");
  for (const d of packet.knowledge.differentials) {
    const tag = d.redFlagFor ? ` [red flag for: ${d.redFlagFor}]` : "";
    lines.push(`  • (${d.commonality}) ${d.dx}${tag}`);
  }
  lines.push("");
  lines.push("─── Suggested labs / imaging ───");
  for (const item of packet.knowledge.labsImaging) lines.push(`  • ${item}`);
  lines.push("");
  lines.push("─── Treatment options ───");
  for (const item of packet.knowledge.treatments) lines.push(`  • ${item}`);
  lines.push("");
  lines.push("─── ICD-10 candidates ───");
  for (const c of packet.knowledge.icd10Codes) lines.push(`  • ${c.code} — ${c.description}`);
  if (packet.notes.length) {
    lines.push("");
    lines.push("─── Physician review notes ───");
    for (const n of packet.notes) lines.push(`  • ${n}`);
  }
  return lines.join("\n");
}

// ─── Physician handoff over WhatsApp ──────────────────────────────────────────
//
// After buildPhysicianPacket runs, we extract a structured summary from the
// transcript (one LLM call, off the patient hot path) and send a formatted
// WhatsApp message to PHYSICIAN_PHONE_NUMBER with the chief complaint,
// patient summary, differentials, suggested workup, and the three action
// reply keywords (URGENT / UC / CALLBACK). The mapping caseId → patient
// phone is held in memory so the physician's reply can be routed back to
// the correct patient.

export interface ExtractedClinicalSummary {
  ageSex:           string;        // "54F", "—" if unknown
  duration:         string;        // free text from the patient ("3 days")
  severity:         string;        // "7/10" or "—"
  keyFindings:      string[];      // short bullets
  medicationsTried: string[];      // short bullets
  redFlagsPresent:  string[];      // red-flag findings the patient endorsed
  redFlagsRuledOut: string[];      // red-flag findings the patient denied
}

const SUMMARY_MODEL          = "claude-sonnet-4-6";
const SUMMARY_MAX_TOKENS     = 600;
const SUMMARY_TIMEOUT_MS     = 10_000;

let _summaryClient: Anthropic | null = null;
function summaryClient(): Anthropic {
  if (!_summaryClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _summaryClient = new Anthropic({ apiKey });
  }
  return _summaryClient;
}

function emptySummary(): ExtractedClinicalSummary {
  return {
    ageSex:           "—",
    duration:         "—",
    severity:         "—",
    keyFindings:      [],
    medicationsTried: [],
    redFlagsPresent:  [],
    redFlagsRuledOut: [],
  };
}

/**
 * Pull a JSON object out of a model response that may contain prose framing
 * or a ```json fence. Returns null if no balanced object is found.
 */
function parseFirstJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Extract a structured clinical summary from the conversation transcript.
 * One LLM call, run at conversation close (not on the patient hot path).
 * Returns an empty summary on any failure — the physician still receives
 * the packet with the raw transcript visible.
 */
export async function extractClinicalSummary(packet: PhysicianPacket): Promise<ExtractedClinicalSummary> {
  const transcriptText = packet.transcript
    .map(t => `${t.role === "user" ? "Patient" : "Auralyn"}: ${t.content}`)
    .join("\n");

  const redFlagList = packet.knowledge.differentials
    .filter(d => d.redFlagFor)
    .map(d => d.redFlagFor!)
    .join(", ");

  const system =
    "You extract a brief structured summary from a triage chat transcript. " +
    "Reply with ONLY a JSON object (no prose, no code fence) with these keys: " +
    "ageSex (e.g. \"54F\"), duration, severity (e.g. \"7/10\"), " +
    "keyFindings (string[]), medicationsTried (string[]), " +
    "redFlagsPresent (string[]), redFlagsRuledOut (string[]). " +
    "Use \"—\" for any scalar field the patient did not provide. " +
    "Keep each list entry under 60 characters. Do not invent details.";

  const user =
    `Chief complaint: ${packet.display}\n` +
    `Possible red-flag categories: ${redFlagList || "(none registered)"}\n\n` +
    `Transcript:\n${transcriptText}\n\n` +
    `Return the JSON object now.`;

  let raw = "";
  try {
    const result = await Promise.race([
      summaryClient().messages.create({
        model:       SUMMARY_MODEL,
        max_tokens:  SUMMARY_MAX_TOKENS,
        temperature: 0.0,
        system,
        messages: [{ role: "user", content: user }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("summary timeout")), SUMMARY_TIMEOUT_MS),
      ),
    ]);
    const block = result.content.find((b: any) => b.type === "text") as { type: "text"; text: string } | undefined;
    raw = block?.text ?? "";
  } catch (e: any) {
    console.warn(`[PhysicianPacket] summary extraction failed: ${e?.message ?? e}`);
    return emptySummary();
  }

  const parsed = parseFirstJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return emptySummary();

  const asString = (v: any): string => (typeof v === "string" && v.trim() ? v.trim() : "—");
  const asList   = (v: any): string[] => Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : [];

  return {
    ageSex:           asString(parsed.ageSex),
    duration:         asString(parsed.duration),
    severity:         asString(parsed.severity),
    keyFindings:      asList(parsed.keyFindings),
    medicationsTried: asList(parsed.medicationsTried),
    redFlagsPresent:  asList(parsed.redFlagsPresent),
    redFlagsRuledOut: asList(parsed.redFlagsRuledOut),
  };
}

/**
 * Format the physician-facing WhatsApp message. Single string body —
 * Twilio delivers as one atomic message.
 */
export function formatPhysicianWhatsAppMessage(
  packet: PhysicianPacket,
  summary: ExtractedClinicalSummary,
): string {
  const lines: string[] = [];
  lines.push("🔔 NEW PATIENT TRIAGE");
  lines.push(`Chief complaint: ${packet.display}`);
  lines.push(`Age/Sex: ${summary.ageSex}`);
  lines.push(`Duration: ${summary.duration}`);
  lines.push(`Severity: ${summary.severity}`);

  lines.push("");
  lines.push("Key findings:");
  if (summary.keyFindings.length) {
    for (const f of summary.keyFindings) lines.push(`• ${f}`);
  } else {
    lines.push("• —");
  }

  lines.push("");
  lines.push("Medications tried:");
  if (summary.medicationsTried.length) {
    for (const m of summary.medicationsTried) lines.push(`• ${m}`);
  } else {
    lines.push("• —");
  }

  // Differentials — top 3 "common" first, then up to 3 red-flag "cannot miss".
  const topLikely = packet.knowledge.differentials
    .filter(d => d.commonality === "common")
    .slice(0, 3)
    .map(d => d.dx);
  lines.push("");
  lines.push("Differentials (from knowledge base):");
  lines.push(`Most likely: ${topLikely.length ? topLikely.join("; ") : "—"}`);

  const cannotMiss = packet.knowledge.differentials
    .filter(d => !!d.redFlagFor)
    .slice(0, 5)
    .map(d => {
      const trigger = d.redFlagFor!;
      const present = summary.redFlagsPresent.some(p => p.toLowerCase().includes(trigger.toLowerCase()));
      const ruled   = summary.redFlagsRuledOut.some(p => p.toLowerCase().includes(trigger.toLowerCase()));
      const status  = present ? "PRESENT" : ruled ? "ruled out" : "unclear";
      return `${d.dx} (${trigger}) — ${status}`;
    });
  lines.push("Cannot miss:");
  if (cannotMiss.length) {
    for (const c of cannotMiss) lines.push(`• ${c}`);
  } else {
    lines.push("• —");
  }

  lines.push("");
  lines.push("Suggested workup:");
  const workup = packet.knowledge.labsImaging.slice(0, 6);
  if (workup.length) {
    for (const w of workup) lines.push(`• ${w}`);
  } else {
    lines.push("• —");
  }

  lines.push("");
  lines.push("Treatment options (physician selects):");
  const treatments = packet.knowledge.treatments.slice(0, 6);
  if (treatments.length) {
    for (const t of treatments) lines.push(`• ${t}`);
  } else {
    lines.push("• —");
  }

  lines.push("");
  lines.push("ICD-10 candidates:");
  const codes = packet.knowledge.icd10Codes.slice(0, 6);
  if (codes.length) {
    for (const c of codes) lines.push(`• ${c.code} — ${c.description}`);
  } else {
    lines.push("• —");
  }

  lines.push("");
  lines.push("Physician action — reply with one keyword:");
  lines.push("URGENT — send patient to ER");
  lines.push("UC — seen at urgent care");
  lines.push("CALL — call the patient first");
  lines.push("HOME — safe to manage at home");
  lines.push("");
  lines.push(`Case: ${packet.caseId}`);
  lines.push(`If more than one patient is awaiting your reply, add this Case ID after the keyword (e.g. HOME ${packet.caseId}).`);
  lines.push("For clinical decision support only.");
  return lines.join("\n");
}

// ─── Patient mapping for physician replies ────────────────────────────────────

interface PendingCase {
  caseId:       string;
  patientPhone: string;       // E.164 or whatsapp:E.164 — passed straight to sendWhatsAppMessage
  complaint:    string;
  slug:         string;       // complaint slug, for the audit record
  sentAt:       number;
}

const PENDING_TTL_MS = 6 * 60 * 60 * 1000;   // 6 hours
const pendingByCaseId  = new Map<string, PendingCase>();

function gcPending(): void {
  const now = Date.now();
  for (const [k, v] of pendingByCaseId.entries()) {
    if (now - v.sentAt > PENDING_TTL_MS) pendingByCaseId.delete(k);
  }
}

/** Normalize a phone number for equality checks (digits-only). */
function digitsOnly(phone: string): string {
  return String(phone || "").replace(/[^\d]/g, "");
}

/** Returns true if `from` matches PHYSICIAN_PHONE_NUMBER (env var). */
export function isPhysicianNumber(from: string): boolean {
  const expected = process.env.PHYSICIAN_PHONE_NUMBER;
  if (!expected) return false;
  return digitsOnly(from) === digitsOnly(expected);
}

/**
 * Build the structured summary, format the WhatsApp packet, send it to the
 * physician, and record the case→patient mapping so a follow-up reply can
 * be routed back. Returns true if a packet was actually sent.
 */
export async function sendPhysicianPacket(args: {
  packet:       PhysicianPacket;
  patientPhone: string;   // patient's WhatsApp number (the `to` for downstream disposition messages)
}): Promise<boolean> {
  const { packet, patientPhone } = args;
  const physicianPhone = process.env.PHYSICIAN_PHONE_NUMBER;
  if (!physicianPhone) {
    console.warn("[PhysicianPacket] PHYSICIAN_PHONE_NUMBER not set — skipping handoff send");
    return false;
  }

  const summary = await extractClinicalSummary(packet);
  const body    = formatPhysicianWhatsAppMessage(packet, summary);

  gcPending();
  pendingByCaseId.set(packet.caseId, {
    caseId:       packet.caseId,
    patientPhone,
    complaint:    packet.display,
    slug:         packet.slug,
    sentAt:       Date.now(),
  });

  try {
    await sendWhatsAppMessage(physicianPhone, body);
    console.log(`[PhysicianPacket] handoff sent to physician — caseId=${packet.caseId} slug=${packet.slug}`);
    return true;
  } catch (e: any) {
    console.error(`[PhysicianPacket] failed to send physician handoff: ${e?.message ?? e}`);
    return false;
  }
}

// ─── Physician reply → patient disposition ────────────────────────────────────

export type PhysicianAction = "URGENT" | "UC" | "CALL" | "HOME";

export function parsePhysicianAction(text: string): PhysicianAction | null {
  const t = text.trim().toUpperCase();
  // Accept the bare keyword or "reply URGENT" / "URGENT please" forms.
  // ER is the highest-acuity action — check it first so a compound message
  // can never be down-triaged. CALLBACK is accepted as a legacy alias for
  // CALL (older packets in flight instructed "CALLBACK").
  if (/\bURGENT\b/.test(t))              return "URGENT";
  if (/\bUC\b/.test(t))                  return "UC";
  if (/\bCALL(BACK)?\b/.test(t))         return "CALL";
  if (/\bHOME\b/.test(t))                return "HOME";
  return null;
}

// Keyword → canonical clinical disposition, for the AUDIT record only.
//
// We deliberately do NOT route these keywords through OntologyFieldMapper:
// its alias table maps the literal string "URGENT" to URGENT_CARE, whereas in
// this physician-reply flow URGENT means "send to the ER" (ER_SEND). Routing
// the keyword through the resolver would silently down-triage an ER decision.
// This map is the authoritative meaning of THIS flow's reply keywords.
// CALL is a process step (phone the patient first), not a final disposition,
// so it has no canonical disposition value.
const ACTION_TO_DISPOSITION: Record<PhysicianAction, DispositionCanonical | null> = {
  URGENT: "ER_SEND",
  UC:     "URGENT_CARE",
  HOME:   "SELF_CARE",
  CALL:   null,
};

function patientDispositionMessage(action: PhysicianAction, complaint: string): string {
  switch (action) {
    case "URGENT":
      return [
        `🚑 Update from our care team`,
        ``,
        `Based on what you've shared about your ${complaint.toLowerCase()}, our physician wants you seen in the emergency room right away.`,
        ``,
        `Please head to the nearest ER now. If you don't have a safe way to get there, call 911 and they will come to you.`,
        ``,
        `You're doing the right thing by reaching out — take care of yourself.`,
        ``,
        `_Auralyn care team_`,
      ].join("\n");
    case "UC":
      return [
        `🏥 Update from our care team`,
        ``,
        `Thanks for telling us about your ${complaint.toLowerCase()}. Our physician would like you seen at urgent care today.`,
        ``,
        `Please head to your nearest urgent care clinic when you're able. Bring a list of any medications you've taken so far.`,
        ``,
        `If anything gets worse before you arrive — sudden severe symptoms, trouble breathing, fainting — call 911 right away.`,
        ``,
        `Take care,`,
        `_Auralyn care team_`,
      ].join("\n");
    case "CALL":
      return [
        `📞 Update from our care team`,
        ``,
        `Thanks for sharing what's going on. Our physician has reviewed your information and would like to speak with you by phone before deciding the next step.`,
        ``,
        `Someone from the care team will call you shortly at this number. If you don't hear back within the next hour, just reply here and we'll follow up.`,
        ``,
        `If your symptoms suddenly get much worse while you wait, please call 911.`,
        ``,
        `_Auralyn care team_`,
      ].join("\n");
    case "HOME":
      return [
        `🏠 Update from our care team`,
        ``,
        `Thanks for sharing what's going on with your ${complaint.toLowerCase()}. Our physician has reviewed your information and feels it's safe to care for this at home for now.`,
        ``,
        `Please rest, stay hydrated, and reach out to your primary care doctor if things aren't improving over the next day or two.`,
        ``,
        `Please seek care right away — or call 911 — if anything changes for the worse: sudden severe symptoms, trouble breathing, chest pain, fainting, weakness, confusion, or symptoms that quickly get worse.`,
        ``,
        `Take care,`,
        `_Auralyn care team_`,
      ].join("\n");
  }
}

/**
 * Resolve which pending case a physician reply targets.
 *
 * Safety: a bare one-word reply is ambiguous when more than one patient is
 * awaiting a disposition (WhatsApp gives us no thread to bind the reply to a
 * case). To avoid dispatching a disposition to the WRONG patient we:
 *   1. match a Case ID quoted anywhere in the reply text, else
 *   2. use the sole pending case when exactly one is awaiting, else
 *   3. fail closed (return { ambiguous: true } and dispatch nothing).
 */
function resolveTargetCase(text: string):
  | { case: PendingCase }
  | { ambiguous: true; pending: PendingCase[] }
  | { none: true } {
  const pending = [...pendingByCaseId.values()];
  if (pending.length === 0) return { none: true };

  const upper = text.toUpperCase();
  const quoted = pending.find(p => upper.includes(p.caseId.toUpperCase()));
  if (quoted) return { case: quoted };

  if (pending.length === 1) return { case: pending[0] };
  return { ambiguous: true, pending };
}

/**
 * Handle a WhatsApp message that came from PHYSICIAN_PHONE_NUMBER. If the
 * message is one of the action keywords, dispatch the matching disposition
 * message to the targeted pending patient, append an audit event, and clear
 * the mapping.
 *
 * Returns true if the message was a physician action that we handled.
 */
export async function handlePhysicianReply(args: {
  from: string;
  text: string;
}): Promise<boolean> {
  if (!isPhysicianNumber(args.from)) return false;

  const action = parsePhysicianAction(args.text);
  if (!action) {
    // Physician sent a non-action message. Acknowledge and exit — do NOT
    // route arbitrary physician text into the patient triage pipeline.
    try {
      await sendWhatsAppMessage(
        args.from,
        `Reply URGENT, UC, CALL, or HOME to dispatch a disposition. If more than one patient is pending, add the Case ID after the keyword.`,
      );
    } catch { /* swallow — already best-effort */ }
    return true;
  }

  gcPending();
  const target = resolveTargetCase(args.text);

  if ("none" in target) {
    try {
      await sendWhatsAppMessage(
        args.from,
        `No pending patient to dispatch. (No triage packet is currently awaiting your reply.)`,
      );
    } catch { /* best-effort */ }
    return true;
  }

  if ("ambiguous" in target) {
    // FAIL CLOSED: never guess which patient a bare keyword refers to.
    const list = target.pending.map(p => `${p.caseId} (${p.complaint})`).join("\n");
    try {
      await sendWhatsAppMessage(
        args.from,
        `⚠️ ${target.pending.length} patients are awaiting a reply, so I can't tell which one "${action}" is for. Reply again with the Case ID after the keyword, e.g. "${action} ${target.pending[0].caseId}". Pending:\n${list}`,
      );
    } catch { /* best-effort */ }
    return true;
  }

  const pending = target.case;
  const body    = patientDispositionMessage(action, pending.complaint);

  let delivered = false;
  let sendErr: string | undefined;
  try {
    await sendWhatsAppMessage(pending.patientPhone, body);
    delivered = true;
    console.log(`[PhysicianPacket] dispatched ${action} disposition for case=${pending.caseId}`);
  } catch (e: any) {
    sendErr = e?.message ?? String(e);
    console.error(`[PhysicianPacket] failed to send patient disposition: ${sendErr}`);
  }

  // Audit the physician's clinical decision through the canonical hash chain.
  // PHI-safe: caseId is a random id; we record the complaint type, action, and
  // canonical disposition — never the patient phone number or transcript.
  try {
    await appendAuditEvent({
      traceId: pending.caseId,
      step:    "physician_disposition",
      input:   { action, source: "whatsapp_physician_reply" },
      output:  {
        disposition: ACTION_TO_DISPOSITION[action],
        delivered,
        ...(sendErr ? { deliveryError: sendErr } : {}),
      },
      metadata: {
        complaint:        pending.complaint,
        slug:             pending.slug,
        physicianContact: "verified_number",   // sender matched PHYSICIAN_PHONE_NUMBER
        intendedUse:      "clinical_decision_support_only",
      },
    });
  } catch (e: any) {
    // Loud, not silent — a failed audit on a clinical decision is itself a
    // finding, but it must not undo a disposition already sent to the patient.
    console.error(`[PhysicianPacket] AUDIT FAILED for physician_disposition case=${pending.caseId}: ${e?.message ?? e}`);
  }

  if (!delivered) {
    try {
      await sendWhatsAppMessage(
        args.from,
        `⚠️ Could not deliver the ${action} message to the patient (${sendErr ?? "send error"}). Please try again or contact the patient directly.`,
      );
    } catch { /* best-effort */ }
    return true;
  }

  pendingByCaseId.delete(pending.caseId);

  try {
    await sendWhatsAppMessage(
      args.from,
      `✅ ${action} sent to patient for case ${pending.caseId} (${pending.complaint}).`,
    );
  } catch { /* best-effort */ }
  return true;
}
