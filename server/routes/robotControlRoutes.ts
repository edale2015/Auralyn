import express from "express";
import { sendRobotCommand, runExamProtocol, getRobotCommandLog } from "../robotics/robotController";

const router = express.Router();

router.post("/command", async (req, res) => {
  try {
    const cmd = req.body;
    if (!cmd?.type) return res.status(400).json({ ok: false, error: "command type required" });
    const result = await sendRobotCommand(cmd);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/protocol/:name", async (req, res) => {
  try {
    const protocol = req.params.name as "throat" | "ear" | "wound";
    if (!["throat", "ear", "wound"].includes(protocol)) {
      return res.status(400).json({ ok: false, error: "protocol must be: throat | ear | wound" });
    }
    const results = await runExamProtocol(protocol);
    res.json({ ok: true, protocol, steps: results.length, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/log", (_req, res) => {
  try {
    res.json({ ok: true, log: getRobotCommandLog() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
