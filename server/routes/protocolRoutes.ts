import express from "express";
import { runExamProtocol, protocolRegistry } from "../protocols/examProtocolEngine";
import { analyzeThroatImage, analyzeEarImage, analyzeRashImage } from "../multimodal/visionEngine";
import { sendRobotCommand } from "../robotics/robotController";
import { readDevice } from "../devices/deviceManager";

import "../protocols/soreThroat.protocol";
import "../protocols/earPain.protocol";
import "../protocols/rash.protocol";
import "../protocols/fluProtocol";

const router = express.Router();

function buildContext(answers: Record<string, unknown>, imageUrl?: string) {
  return {
    async ask(_question: string, field: string): Promise<unknown> {
      return answers[field] ?? null;
    },

    async vision(target: string): Promise<Record<string, unknown>> {
      const url = imageUrl ?? `https://example.com/${target}.jpg`;
      switch (target) {
        case "throat": return await analyzeThroatImage(url) as Record<string, unknown>;
        case "ear": return await analyzeEarImage(url) as Record<string, unknown>;
        case "rash": return await analyzeRashImage(url) as Record<string, unknown>;
        default: {
          const { analyzeImage } = await import("../multimodal/visionEngine");
          return await analyzeImage({ imageUrl: url }) as Record<string, unknown>;
        }
      }
    },

    async robot(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
      const result = await sendRobotCommand(cmd as any);
      return result as Record<string, unknown>;
    },

    async device(device: string): Promise<Record<string, unknown>> {
      const reading = await readDevice(device);
      return reading as unknown as Record<string, unknown>;
    },
  };
}

router.post("/run/:name", async (req, res) => {
  const name = req.params.name;
  const protocol = protocolRegistry[name];

  if (!protocol) {
    return res.status(404).json({
      ok: false,
      error: `Protocol "${name}" not found`,
      available: Object.keys(protocolRegistry).filter((k) => k.includes("_v")),
    });
  }

  const { answers = {}, imageUrl, patientId } = req.body;
  const ctx = buildContext(answers, imageUrl);

  try {
    const result = await runExamProtocol(protocol, ctx);
    return res.json({ ok: true, protocolId: protocol.id, complaint: protocol.complaint, patientId, result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/list", (_req, res) => {
  const protocols = Object.values(protocolRegistry).filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i
  );
  res.json({
    ok: true,
    count: protocols.length,
    protocols: protocols.map((p) => ({
      id: p.id,
      complaint: p.complaint,
      steps: p.steps.length,
    })),
  });
});

export default router;
