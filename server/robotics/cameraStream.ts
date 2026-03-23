import express from "express";
import { overlayGuidance } from "./visionOverlay";

export const router = express.Router();

router.get("/camera", (req, res) => {
  const tool = (req.query.tool as string) ?? "otoscope";
  const guidance = overlayGuidance({ tool: tool as any });

  res.json({
    frame: null,
    frameAvailable: false,
    note: "Connect a real camera source to provide live frames. Overlay guidance is computed independently.",
    overlay: {
      target: guidance.targetRegion,
      tool: guidance.tool,
      box: [
        guidance.boundingBox.x,
        guidance.boundingBox.y,
        guidance.boundingBox.w,
        guidance.boundingBox.h,
      ],
      confidence: guidance.confidence,
      color: guidance.color,
      safeToAdvance: guidance.safeToAdvance,
      instructions: guidance.instructions,
    },
    timestamp: new Date().toISOString(),
  });
});

router.get("/camera/overlay", (req, res) => {
  const tool = (req.query.tool as string) ?? "otoscope";
  const guidance = overlayGuidance({ tool: tool as any });
  res.json({ ok: true, guidance });
});
