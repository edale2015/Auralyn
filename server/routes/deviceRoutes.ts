import express from "express";
import { readDevice, readMultiple, getDeviceStatus, detectSTElevation, detectAFib } from "../devices/deviceManager";
import { getWebRTCStats } from "../realtime/webrtcServer";

const router = express.Router();

router.get("/read/:device", async (req, res) => {
  const { device } = req.params;
  const validDevices = ["bp", "spo2", "ekg", "temp", "glucose", "weight"];

  if (!validDevices.includes(device)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown device: ${device}`,
      valid: validDevices,
    });
  }

  try {
    const reading = await readDevice(device);
    return res.json({ ok: true, device, reading });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/read-multiple", async (req, res) => {
  const { devices } = req.body;
  if (!Array.isArray(devices) || devices.length === 0) {
    return res.status(400).json({ ok: false, error: "devices[] array required" });
  }

  try {
    const readings = await readMultiple(devices);
    return res.json({ ok: true, readings });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/status/:device", async (req, res) => {
  try {
    const status = await getDeviceStatus(req.params.device);
    return res.json({ ok: true, status });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/analyze/ekg", async (req, res) => {
  const { waveform } = req.body;
  if (!Array.isArray(waveform)) {
    return res.status(400).json({ ok: false, error: "waveform[] array required" });
  }

  const stElevation = detectSTElevation(waveform);
  const aFib = detectAFib(waveform);
  const emergency = stElevation;

  return res.json({
    ok: true,
    analysis: {
      stElevation,
      aFib,
      emergency,
      interpretation: stElevation
        ? "STEMI pattern detected — immediate escalation required"
        : aFib
          ? "Possible atrial fibrillation — physician review needed"
          : "No critical findings detected",
    },
  });
});

router.get("/webrtc/stats", (_req, res) => {
  res.json({ ok: true, stats: getWebRTCStats() });
});

export default router;
