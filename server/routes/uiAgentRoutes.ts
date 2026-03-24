import express from "express";
import { runUIAutomation, parseInstruction } from "../automation/uiAgent";

const router = express.Router();

router.post("/run", async (req, res) => {
  try {
    const { goal, screenState, maxSteps, sessionId } = req.body;
    if (!goal) return res.status(400).json({ ok: false, error: "goal required" });
    const result = await runUIAutomation({ goal, screenState, maxSteps, sessionId });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/parse", (req, res) => {
  try {
    const { instruction } = req.body;
    if (!instruction) return res.status(400).json({ ok: false, error: "instruction required" });
    const action = parseInstruction(instruction);
    res.json({ ok: true, action });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
