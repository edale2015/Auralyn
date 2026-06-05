import { describe, it, expect } from "vitest";
import { matchComplaintFromText } from "../../server/services/complaintMatchService";

// V103 — Reproduce the complaint-matcher session reset.
//
// kbIntake.ts:698-711 closes the active session and starts a NEW complaint
// whenever matchComplaintFromText(rawText) returns non-null on a follow-up.
// matchComplaintFromText (complaintMatchService.ts:69-85) is an UNANCHORED
// substring match: `if (t.includes(a))`. The neuro_headache row's aliases
// include the fragments "my head" and "head hurts".
//
// DESIRED behavior: an ordinary follow-up that merely echoes the symptom the
// patient is already being interviewed about must NOT be treated as a brand-new
// chief complaint. These assertions encode that desired behavior, so they FAIL
// against current code — proving the bug. Do not "fix" the test to pass.
describe("V103: same-symptom follow-up must not be classified as a new complaint", () => {
  it('"my head still hurts" should not re-fire as a new chief complaint', () => {
    const m = matchComplaintFromText("my head still hurts");
    expect(m).toBeNull(); // EXPECTED TO FAIL: returns { slug: "neuro_headache" }
  });

  it('"the headache is on the left now" should not re-fire as a new chief complaint', () => {
    const m = matchComplaintFromText("the headache is on the left now");
    expect(m).toBeNull(); // EXPECTED TO FAIL
  });

  it("control: a true safe follow-up does NOT match (sanity check)", () => {
    expect(matchComplaintFromText("about 3 days now")).toBeNull(); // should pass
    expect(matchComplaintFromText("7 out of 10")).toBeNull(); // should pass
  });
});
