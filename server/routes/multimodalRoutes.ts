import express from "express";
import { runMultimodalFlow } from "../multimodal/orchestrator";
import { analyzeImage, analyzeEarImage, analyzeThroatImage, analyzeRashImage, triageImageByComplaint } from "../multimodal/visionEngine";
import { getGatewayStats } from "../multimodal/realtimeGateway";

const router = express.Router();

router.post("/flow", async (req, res) => {
  try {
    const result = await runMultimodalFlow({
      text: req.body.text,
      imageUrl: req.body.imageUrl,
      audioTranscript: req.body.audioTranscript,
      videoFrame: req.body.videoFrame,
      patientId: req.body.patientId,
      complaint: req.body.complaint,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/analyze", async (req, res) => {
  try {
    const { imageUrl, context, patientId, complaint } = req.body;
    if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl required" });

    const result = complaint
      ? await triageImageByComplaint(imageUrl, complaint, patientId)
      : await analyzeImage({ imageUrl, context, patientId });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/ear", async (req, res) => {
  try {
    const { imageUrl, patientId } = req.body;
    if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl required" });
    res.json({ ok: true, result: await analyzeEarImage(imageUrl, patientId) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/throat", async (req, res) => {
  try {
    const { imageUrl, patientId } = req.body;
    if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl required" });
    res.json({ ok: true, result: await analyzeThroatImage(imageUrl, patientId) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/rash", async (req, res) => {
  try {
    const { imageUrl, patientId } = req.body;
    if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl required" });
    res.json({ ok: true, result: await analyzeRashImage(imageUrl, patientId) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/gateway/stats", (_req, res) => {
  res.json({ ok: true, stats: getGatewayStats() });
});

export default router;
