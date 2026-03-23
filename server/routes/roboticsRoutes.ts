import express from "express";
import { RoboticController } from "../robotics/roboticController";

const router = express.Router();
const controller = new RoboticController();

router.get("/pose", async (_req, res) => {
  const pose = await controller.getPose();
  res.json({ pose });
});

router.post("/command", async (req, res) => {
  const result = await controller.issueCommand(req.body.command, req.body.safety);
  res.json(result);
});

router.post("/estop", async (_req, res) => {
  res.json({ ok: true, message: "E-STOP acknowledged" });
});

export default router;
