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

import { getClinicalKnowledge, type ClinicalKnowledge } from "./knowledge/registry";
import type { AgentSession } from "./streamingAgent";

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
