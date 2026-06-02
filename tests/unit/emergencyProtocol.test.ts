// Unit tests for the universal clinic emergency protocol.
//
// Covers the deterministic core: patient-phrase matching, the staff alert
// template, and triggerEmergencyProtocol (physician WhatsApp send + audit).
// The send / audit boundaries are mocked. These also demonstrate the protocol
// runs independently of any triage flow — it reads no session and the trigger
// never messages the patient.

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

import {
  matchesEmergencyBypass,
  formatEmergencyAlert,
  triggerEmergencyProtocol,
  EMERGENCY_BYPASS_PATIENT_MESSAGE,
} from "../../server/emergency/emergencyProtocol";

const PHYSICIAN = "+15559990000";

beforeEach(() => {
  h.sent.length = 0;
  h.audits.length = 0;
  process.env.PHYSICIAN_PHONE_NUMBER = PHYSICIAN;
});

describe("matchesEmergencyBypass", () => {
  it.each([
    "I can't breathe",
    "I cant breathe",
    "I'm passing out",
    "I collapsed",
    "there is blood everywhere",
    "I'm having a seizure",
    "I can't see",
    "I think I'm dying",
    "someone help",
    "call 911",
    "I'm unconscious",
    "Please CALL 911 now",      // case-insensitive, within a sentence
  ])("matches emergency phrase: %s", (phrase) => {
    expect(matchesEmergencyBypass(phrase)).toBe(true);
  });

  it.each([
    "I have a mild headache",
    "I can breathe fine now",
    "my fever is passing",
    "I need to see a doctor next week",
    "",
  ])("does not match non-emergency text: %s", (phrase) => {
    expect(matchesEmergencyBypass(phrase)).toBe(false);
  });
});

describe("formatEmergencyAlert", () => {
  it("includes the observation, timestamp, location, ABCs and safety blocks", () => {
    const alert = formatEmergencyAlert({
      observation: "patient slumped over in chair",
      location:    "Waiting room",
      at:          "2026-06-02T12:00:00.000Z",
    });
    expect(alert).toContain("🚨 CLINIC EMERGENCY ALERT");
    expect(alert).toContain("Patient Status: patient slumped over in chair");
    expect(alert).toContain("2026-06-02T12:00:00.000Z");
    expect(alert).toContain("Location: Waiting room");
    expect(alert).toContain("START ABCs");
    expect(alert).toContain("A — AIRWAY");
    expect(alert).toContain("B — BREATHING");
    expect(alert).toContain("C — CIRCULATION");
    expect(alert).toContain("CONSIDER WHILE WAITING");
    expect(alert).toContain("DO NOT");
    expect(alert).toContain("Give anything by mouth");
    expect(alert).toContain("— Auralyn Emergency Protocol");
  });
});

describe("triggerEmergencyProtocol", () => {
  it("sends the staff alert to the physician and audits it (observation not in metadata)", async () => {
    const res = await triggerEmergencyProtocol({
      observation: "collapsed at entrance",
      source:      "staff_dashboard",
      location:    "Entrance",
      traceId:     "CASE_X",
    });

    expect(res.physicianNotified).toBe(true);
    expect(res.alertText).toContain("CLINIC EMERGENCY ALERT");

    // Exactly one WhatsApp send, to the physician — never to a patient.
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe(PHYSICIAN);
    expect(h.sent[0].body).toContain("collapsed at entrance");

    // Audited through the canonical chain.
    expect(h.audits).toHaveLength(1);
    const ev = h.audits[0];
    expect(ev.step).toBe("clinic_emergency_alert");
    expect(ev.traceId).toBe("CASE_X");
    expect(ev.input.observation).toBe("collapsed at entrance");   // regulated record
    expect(ev.output.physicianNotified).toBe(true);
    // PHI-safety: the free-text observation must not appear in metadata.
    expect(JSON.stringify(ev.metadata)).not.toContain("collapsed at entrance");
  });

  it("never messages the patient (staff-only)", async () => {
    await triggerEmergencyProtocol({ observation: "seizing", source: "patient_whatsapp", traceId: "t1" });
    // The only send is to the physician; the patient message is the caller's job.
    expect(h.sent.every(s => s.to === PHYSICIAN)).toBe(true);
    expect(EMERGENCY_BYPASS_PATIENT_MESSAGE).toContain("Call 911 immediately");
  });

  it("still returns the alert and audits when no physician number is configured", async () => {
    delete process.env.PHYSICIAN_PHONE_NUMBER;
    const res = await triggerEmergencyProtocol({ observation: "unresponsive", source: "staff_text" });
    expect(res.physicianNotified).toBe(false);
    expect(res.alertText).toContain("CLINIC EMERGENCY ALERT");
    expect(h.sent).toHaveLength(0);          // nothing sent
    expect(h.audits).toHaveLength(1);        // but still audited
    expect(h.audits[0].output.physicianNotified).toBe(false);
  });
});
