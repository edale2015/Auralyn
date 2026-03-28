import { Router } from "express";
import { goldenStore } from "./testGoldenRoutes";
import { chatCompletion } from "../services/ai/chatgptClient";

const router = Router();

// ─── GET /api/test/coverage/:complaint ────────────────────────────────────────
// Counts how often each node ID appears in golden case result traces
router.get("/coverage/:complaint", (req, res) => {
  const complaint = req.params.complaint.toLowerCase().replace(/-/g, "_");
  const coverageMap: Record<string, number> = {};

  for (const c of goldenStore.values()) {
    const input = c.input as any;
    // Match by complaint field on the case input
    const caseComplaint = (input?.complaint ?? "").toLowerCase().replace(/-/g, "_");
    if (complaint !== "all" && caseComplaint !== complaint && caseComplaint !== "") {
      // still include if no complaint filter set on the case
      if (caseComplaint) continue;
    }

    const trace: any[] = (c.result as any)?.trace ?? [];
    for (const step of trace) {
      const nodeId = step.name ?? step.id ?? step.step;
      if (!nodeId) continue;
      coverageMap[nodeId] = (coverageMap[nodeId] ?? 0) + 1;
    }
  }

  res.json({ ok: true, complaint, coverage: coverageMap });
});

// ─── POST /api/test/generate-cases ───────────────────────────────────────────
// GPT-powered synthetic case generator for uncovered nodes
router.post("/generate-cases", async (req, res) => {
  const { complaint = "ent_sore_throat", uncoveredNodes = [], treeNodes = [] } = req.body as {
    complaint?: string;
    uncoveredNodes?: Array<{ id: string; label: string; type: string }>;
    treeNodes?: Array<{ id: string; label: string; type: string }>;
  };

  const targets = uncoveredNodes.length > 0 ? uncoveredNodes : treeNodes.filter(n => n.type === "question").slice(0, 5);

  if (targets.length === 0) {
    return res.json({ ok: true, cases: [], message: "No uncovered nodes to target" });
  }

  const targetSummary = targets
    .slice(0, 8)
    .map(n => `- ${n.id}: "${n.label}" (${n.type})`)
    .join("\n");

  const systemPrompt = `You are a clinical case generator for a medical triage AI. Generate synthetic test cases that exercise specific decision tree nodes. Return ONLY valid JSON with no explanation.`;

  const userPrompt = `Complaint context: ${complaint}

Target uncovered nodes to exercise:
${targetSummary}

Generate ${Math.min(targets.length, 6)} synthetic patient test cases that would traverse these nodes. Each case should have realistic symptoms that would trigger the target nodes.

Return this exact JSON structure:
{
  "cases": [
    {
      "id": "auto_${complaint}_001",
      "input": {
        "complaint": "${complaint}",
        "symptoms": ["symptom1", "symptom2"],
        "age": 35,
        "rawText": "patient description"
      },
      "expected": {
        "diagnosis": "likely_diagnosis",
        "disposition": "triage_level"
      },
      "targetNodes": ["node_id_1", "node_id_2"],
      "rationale": "Why this case exercises those nodes"
    }
  ]
}`;

  try {
    const result = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ], { model: "gpt-4o-mini", maxTokens: 1200 });

    let parsed: any = { cases: [] };
    try {
      const raw = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(raw);
    } catch {
      // Heuristic fallback — generate basic cases for each uncovered node
      parsed = {
        cases: targets.slice(0, 6).map((n, i) => ({
          id: `auto_${complaint}_${String(i + 1).padStart(3, "0")}`,
          input: {
            complaint,
            symptoms: [n.label.toLowerCase().replace(/\?/g, "").trim(), "fever"],
            age: 30 + i * 5,
            rawText: `Patient presents with ${n.label.toLowerCase().replace(/\?/g, "").trim()}`,
          },
          expected: {
            diagnosis: "pending_review",
            disposition: "routine_care",
          },
          targetNodes: [n.id],
          rationale: `Auto-generated to exercise uncovered node: ${n.id}`,
        })),
      };
    }

    // Stamp with generated timestamp
    const cases = (parsed.cases ?? []).map((c: any, i: number) => ({
      ...c,
      id: c.id ?? `auto_${complaint}_${Date.now()}_${i}`,
      status: "pending",
      generatedAt: new Date().toISOString(),
      source: "auto_generator",
    }));

    res.json({ ok: true, cases, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
