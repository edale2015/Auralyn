// Unit tests for the physician-reply -> patient-disposition flow.
//
// Covers the deterministic, safety-critical logic added to physicianPacket.ts:
//   - keyword parsing (URGENT / UC / CALL[BACK] / HOME) incl. down-triage
//     protection (a compound message must resolve to the highest acuity);
//   - the physician WhatsApp message now carrying treatments + ICD-10;
//   - dispatch + audit on a single pending case;
//   - FAIL-CLOSED disambiguation when more than one patient is pending;
//   - PHI-safety of the audit record (no patient phone number).
//
// The send / audit / LLM boundaries are mocked. Module state (pendingByCaseId)
// is isolated per test via vi.resetModules() + dynamic import.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  sent:   [] as Array<{ to: string; body: string }>,
  audits: [] as any[],
}));

vi.mock("../../server/whatsapp/send", () => ({
  sendWhatsAppMessage: vi.fn(async (to: string, body: string) => {
    h.sent.push({ to, body });
    return { sid: "SM_test" };
  }),
}));

vi.mock("../../server/audit/hashChain", () => ({
  appendAuditEvent: vi.fn(async (data: any) => {
    h.audits.push(data);
    return { hash: "deadbeef" };
  }),
}));

// Minimal Anthropic stub so extractClinicalSummary resolves without a network call.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [
          {
            type: "text",
            text: '{"ageSex":"40F","duration":"2 days","severity":"6/10","keyFindings":[],"medicationsTried":[],"redFlagsPresent":[],"redFlagsRuledOut":[]}',
          },
        ],
      }),
    };
  },
}));

import type { AgentSession } from "../../server/whatsapp/agent/streamingAgent";

const PHYSICIAN = "+15559990000";

function closedSession(): AgentSession {
  return {
    slug:        "neuro_headache",
    exchanges:   [
      { role: "user", content: "my head hurts" },
      { role: "assistant", content: "How old are you, and are you male or female?" },
    ],
    closed:      true,
    startedAt:   1_000,
    closedAt:    3_000,
    closeReason: "model_closed",
  };
}

// Fresh module instance per test so the in-memory pending map starts empty.
async function freshModule() {
  vi.resetModules();
  return await import("../../server/whatsapp/agent/physicianPacket");
}

beforeEach(() => {
  h.sent.length = 0;
  h.audits.length = 0;
  process.env.PHYSICIAN_PHONE_NUMBER = PHYSICIAN;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("parsePhysicianAction", () => {
  it("parses each keyword, case-insensitively and within a sentence", async () => {
    const { parsePhysicianAction } = await freshModule();
    expect(parsePhysicianAction("URGENT")).toBe("URGENT");
    expect(parsePhysicianAction("uc")).toBe("UC");
    expect(parsePhysicianAction("please CALL the patient")).toBe("CALL");
    expect(parsePhysicianAction("HOME")).toBe("HOME");
  });

  it("treats legacy CALLBACK as CALL", async () => {
    const { parsePhysicianAction } = await freshModule();
    expect(parsePhysicianAction("CALLBACK")).toBe("CALL");
  });

  it("returns null for non-action text", async () => {
    const { parsePhysicianAction } = await freshModule();
    expect(parsePhysicianAction("thanks, will review")).toBeNull();
    expect(parsePhysicianAction("")).toBeNull();
  });

  it("never down-triages: a message containing URGENT resolves to URGENT", async () => {
    const { parsePhysicianAction } = await freshModule();
    // Even if the physician also typed a lower-acuity word, ER wins.
    expect(parsePhysicianAction("HOME — actually no, URGENT")).toBe("URGENT");
    expect(parsePhysicianAction("URGENT not home")).toBe("URGENT");
  });
});

describe("formatPhysicianWhatsAppMessage", () => {
  it("includes treatments, ICD-10 codes, and the four action keywords", async () => {
    const m = await freshModule();
    const packet = m.buildPhysicianPacket({ caseId: "CASE_FMT", session: closedSession() })!;
    expect(packet).toBeTruthy();
    const msg = m.formatPhysicianWhatsAppMessage(packet, {
      ageSex: "40F", duration: "2 days", severity: "6/10",
      keyFindings: [], medicationsTried: [], redFlagsPresent: [], redFlagsRuledOut: [],
    });
    expect(msg).toContain("Treatment options");
    expect(msg.toLowerCase()).toContain("ibuprofen");      // from NEURO_HEADACHE_KNOWLEDGE.treatments
    expect(msg).toContain("ICD-10 candidates");
    expect(msg).toContain("R51.9");                          // from NEURO_HEADACHE_KNOWLEDGE.icd10Codes
    expect(msg).toContain("URGENT — send patient to ER");
    expect(msg).toContain("UC — seen at urgent care");
    expect(msg).toContain("CALL — call the patient first");
    expect(msg).toContain("HOME — safe to manage at home");
    expect(msg).toContain("CASE_FMT");
  });
});

describe("handlePhysicianReply — single pending case", () => {
  it("dispatches the disposition to the patient and audits the decision (no PHI)", async () => {
    const m = await freshModule();
    const patientPhone = "whatsapp:+15550001111";
    const packet = m.buildPhysicianPacket({ caseId: "CASE_A", session: closedSession() })!;
    await m.sendPhysicianPacket({ packet, patientPhone });
    h.sent.length = 0;   // drop the physician-packet send; focus on the reply

    const handled = await m.handlePhysicianReply({ from: `whatsapp:${PHYSICIAN}`, text: "URGENT" });
    expect(handled).toBe(true);

    const toPatient   = h.sent.find(s => s.to === patientPhone);
    const toPhysician = h.sent.find(s => s.to !== patientPhone);
    expect(toPatient?.body.toLowerCase()).toContain("emergency room");
    expect(toPhysician?.body).toContain("✅");

    expect(h.audits).toHaveLength(1);
    const ev = h.audits[0];
    expect(ev.step).toBe("physician_disposition");
    expect(ev.traceId).toBe("CASE_A");
    expect(ev.output.disposition).toBe("ER_SEND");
    expect(ev.output.delivered).toBe(true);
    // PHI-safety: the patient phone number must never appear in the audit record.
    expect(JSON.stringify(ev)).not.toContain("15550001111");
  });

  it("maps HOME to SELF_CARE and sends an at-home message", async () => {
    const m = await freshModule();
    const patientPhone = "whatsapp:+15550002222";
    const packet = m.buildPhysicianPacket({ caseId: "CASE_H", session: closedSession() })!;
    await m.sendPhysicianPacket({ packet, patientPhone });
    h.sent.length = 0;

    await m.handlePhysicianReply({ from: `whatsapp:${PHYSICIAN}`, text: "HOME" });

    const toPatient = h.sent.find(s => s.to === patientPhone);
    expect(toPatient?.body.toLowerCase()).toContain("at home");
    expect(h.audits[0].output.disposition).toBe("SELF_CARE");
  });
});

describe("handlePhysicianReply — multiple pending (disambiguation)", () => {
  it("FAILS CLOSED on a bare keyword: dispatches nothing, asks for the Case ID", async () => {
    const m = await freshModule();
    const pA = "whatsapp:+15550003333";
    const pB = "whatsapp:+15550004444";
    await m.sendPhysicianPacket({ packet: m.buildPhysicianPacket({ caseId: "CASE_A", session: closedSession() })!, patientPhone: pA });
    await m.sendPhysicianPacket({ packet: m.buildPhysicianPacket({ caseId: "CASE_B", session: closedSession() })!, patientPhone: pB });
    h.sent.length = 0;

    await m.handlePhysicianReply({ from: `whatsapp:${PHYSICIAN}`, text: "HOME" });

    // No patient received anything.
    expect(h.sent.some(s => s.to === pA || s.to === pB)).toBe(false);
    // Physician got a disambiguation prompt listing both cases.
    const warn = h.sent.find(s => s.to !== pA && s.to !== pB);
    expect(warn?.body).toContain("CASE_A");
    expect(warn?.body).toContain("CASE_B");
    // No clinical decision was made, so nothing is audited.
    expect(h.audits).toHaveLength(0);
  });

  it("dispatches to the case named in the reply when the Case ID is supplied", async () => {
    const m = await freshModule();
    const pA = "whatsapp:+15550005555";
    const pB = "whatsapp:+15550006666";
    await m.sendPhysicianPacket({ packet: m.buildPhysicianPacket({ caseId: "CASE_A", session: closedSession() })!, patientPhone: pA });
    await m.sendPhysicianPacket({ packet: m.buildPhysicianPacket({ caseId: "CASE_B", session: closedSession() })!, patientPhone: pB });
    h.sent.length = 0;

    await m.handlePhysicianReply({ from: `whatsapp:${PHYSICIAN}`, text: "HOME CASE_B" });

    expect(h.sent.some(s => s.to === pA)).toBe(false);          // case A untouched
    expect(h.sent.find(s => s.to === pB)?.body.toLowerCase()).toContain("at home");
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].traceId).toBe("CASE_B");
    expect(h.audits[0].output.disposition).toBe("SELF_CARE");
  });
});

describe("handlePhysicianReply — guards", () => {
  it("ignores messages from non-physician numbers", async () => {
    const m = await freshModule();
    const handled = await m.handlePhysicianReply({ from: "whatsapp:+15551234567", text: "URGENT" });
    expect(handled).toBe(false);
    expect(h.sent).toHaveLength(0);
  });

  it("with nothing pending, tells the physician there is no patient to dispatch", async () => {
    const m = await freshModule();
    await m.handlePhysicianReply({ from: `whatsapp:${PHYSICIAN}`, text: "URGENT" });
    expect(h.sent[0].body.toLowerCase()).toContain("no pending patient");
    expect(h.audits).toHaveLength(0);
  });
});
