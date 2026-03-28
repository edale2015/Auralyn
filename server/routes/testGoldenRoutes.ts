import { Router } from "express";
import { auditLog } from "../security/auditLogger";

const router = Router();

export interface GoldenCase {
  id:       string;
  input?:   unknown;
  expected?: unknown;
  result?:  unknown;
  status?:  "pass" | "fail" | "pending";
  ranAt?:   string;
}

const goldenStore: Map<string, GoldenCase> = new Map([
  ["sore_throat_01", {
    id: "sore_throat_01",
    input:    { complaint: "sore_throat", symptoms: ["fever", "tonsillar exudate", "no cough"], age: 21 },
    expected: { diagnosis: "strep_throat", disposition: "routine_antibiotics" },
    status:   "pending",
  }],
  ["otitis_media_01", {
    id: "otitis_media_01",
    input:    { complaint: "ear_pain", symptoms: ["ear pain", "pulling ear", "fever"], age: 6 },
    expected: { diagnosis: "otitis_media", disposition: "antibiotics" },
    status:   "pending",
  }],
  ["influenza_01", {
    id: "influenza_01",
    input:    { complaint: "flu_symptoms", symptoms: ["sudden fever", "body aches", "fatigue"], age: 45 },
    expected: { diagnosis: "influenza_a", disposition: "oseltamivir" },
    status:   "pending",
  }],
]);

// GET /api/test/golden — list all cases
router.get("/", (_req, res) => {
  res.json({ ok: true, cases: Array.from(goldenStore.values()) });
});

// GET /api/test/golden/failures — only failed cases (must be before /:id)
router.get("/failures", (_req, res) => {
  const failures = Array.from(goldenStore.values()).filter(c => c.status === "fail");
  res.json({ ok: true, failures, count: failures.length });
});

// GET /api/test/golden/:id — single case
router.get("/:id", (req, res) => {
  const c = goldenStore.get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "Case not found" });
  res.json({ ok: true, case: c });
});

// POST /api/test/golden/batch-save — batch upsert (must be before /:id catch)
router.post("/batch-save", (req, res) => {
  const { cases } = req.body as { cases: GoldenCase[] };
  if (!Array.isArray(cases) || cases.length === 0)
    return res.status(400).json({ ok: false, error: "cases array required" });
  const saved: GoldenCase[] = [];
  for (const body of cases) {
    if (!body?.id) continue;
    const existing = goldenStore.get(body.id) ?? {} as GoldenCase;
    const merged: GoldenCase = { ...existing, ...body, id: body.id };
    goldenStore.set(body.id, merged);
    saved.push(merged);
  }
  auditLog({ actor: "auto_generator", action: "golden_batch_saved", entityType: "golden_case", entityId: `batch:${saved.length}` });
  res.json({ ok: true, saved: saved.length, ids: saved.map(c => c.id) });
});

// POST /api/test/golden/save — upsert
router.post("/save", (req, res) => {
  const body = req.body as GoldenCase;
  if (!body?.id) return res.status(400).json({ ok: false, error: "id required" });
  const existing = goldenStore.get(body.id) ?? {} as GoldenCase;
  const merged = { ...existing, ...body, id: body.id };
  goldenStore.set(body.id, merged);
  auditLog({ actor: "control_tower", action: "golden_case_saved", entityType: "golden_case", entityId: body.id });
  res.json({ ok: true, case: merged });
});

// POST /api/test/golden/delete — remove by id
router.post("/delete", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const deleted = goldenStore.delete(id);
  auditLog({ actor: "control_tower", action: "golden_case_deleted", entityType: "golden_case", entityId: id });
  res.json({ ok: true, deleted });
});

// POST /api/test/run-golden — run a golden case through the triage pipeline
router.post("/run-golden", async (req, res) => {
  const body = req.body as GoldenCase;
  if (!body) return res.status(400).json({ ok: false, error: "body required" });

  try {
    const { runPatientFlow } = await import("../patient/patientFlow");
    const input = body.input as any ?? {};
    const start = Date.now();
    const result = await runPatientFlow({
      complaint:  input.complaint ?? "general",
      complaints: input.symptoms  ?? [input.complaint ?? "general"],
      text:       (input.symptoms ?? []).join(", "),
      history:    { age: input.age },
    });

    const latencyMs = Date.now() - start;
    const expected  = body.expected as any ?? {};

    // Soft match — compare disposition/status
    const actualDisposition  = result.disposition ?? result.status ?? "";
    const expectedDisposition = expected.disposition ?? expected.status ?? "";
    const passed = expectedDisposition
      ? actualDisposition.toLowerCase().includes(expectedDisposition.toLowerCase()) ||
        expectedDisposition.toLowerCase().includes(actualDisposition.toLowerCase())
      : true;

    const enriched: GoldenCase = {
      ...body,
      result:  { ...result, latencyMs },
      status:  passed ? "pass" : "fail",
      ranAt:   new Date().toISOString(),
    };
    goldenStore.set(body.id, enriched);

    res.json({
      ok: true,
      case:       enriched,
      passed,
      latencyMs,
      expected,
      actual:     result,
      trace:      (result as any).trace ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export { goldenStore };
export default router;
