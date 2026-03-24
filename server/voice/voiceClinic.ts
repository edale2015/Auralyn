import { runMultimodalFlow } from "../multimodal/orchestrator";
import { runExamProtocol, protocolRegistry, type ProtocolRunContext } from "../protocols/examProtocolEngine";
import { analyzeThroatImage, analyzeEarImage, analyzeRashImage } from "../multimodal/visionEngine";
import { sendRobotCommand } from "../robotics/robotController";
import { readDevice } from "../devices/deviceManager";
import { selectPhysician } from "../routing/loadBalancer";
import { upsertRoom } from "../orchestration/roomManager";
import { computeSystemRisk } from "../risk/predictiveRiskEngine";
import { auditLog } from "../security/auditLogger";
import type { Request, Response } from "express";

import "../protocols/soreThroat.protocol";
import "../protocols/earPain.protocol";
import "../protocols/rash.protocol";
import "../protocols/fluProtocol";


export interface VoiceClinicChunk {
  transcript?: string;
  reply: string;
  done?: boolean;
  escalate?: boolean;
  caseId?: string;
  riskScore?: number;
  nextStep?: string;
}

function selectProtocol(complaint: string) {
  return protocolRegistry[complaint] ?? null;
}

function buildVoiceContext(answers: Record<string, unknown>): ProtocolRunContext {
  return {
    async ask(_q: string, field: string) { return answers[field] ?? null; },
    async vision(target: string) {
      const url = `https://example.com/${target}.jpg`;
      if (target === "throat") return await analyzeThroatImage(url) as Record<string, unknown>;
      if (target === "ear") return await analyzeEarImage(url) as Record<string, unknown>;
      return await analyzeRashImage(url) as Record<string, unknown>;
    },
    async robot(cmd: Record<string, unknown>) {
      return await sendRobotCommand(cmd as any) as Record<string, unknown>;
    },
    async device(d: string) {
      return await readDevice(d) as unknown as Record<string, unknown>;
    },
  };
}

function generateVoiceReply(data: { riskScore?: number; nextStep?: string; complaint?: string }): string {
  const risk = data.riskScore ?? 0;

  if (risk >= 0.8) {
    return "This sounds serious. I am connecting you to a physician right now. Please stay on the line.";
  }
  if (risk >= 0.6) {
    return "Based on your symptoms, a physician should review your case. I am alerting them now.";
  }
  if (data.nextStep === "collect_more") {
    return "Thank you for sharing that. Can you tell me a bit more about when your symptoms started and if anything makes them better or worse?";
  }
  if (data.nextStep === "self_service") {
    return "Your symptoms appear mild. I can guide you through some self-care steps, or connect you with a physician if you prefer.";
  }
  return "I understand. Let me assess your situation. Please describe any other symptoms you are experiencing.";
}

export async function* runVoiceClinic(
  transcripts: string[],
  userId: string,
  caseId?: string
): AsyncGenerator<VoiceClinicChunk> {
  const sessionId = caseId ?? `voice_${Date.now()}`;
  const answers: Record<string, unknown> = {};
  let protocolStarted = false;
  let finalRisk = 0;

  auditLog({ actor: "voice_clinic", action: "session_started", details: { userId, sessionId } });

  for (const text of transcripts) {
    const multimodal = await runMultimodalFlow({ text, patientId: userId });
    const risk = multimodal.structured?.riskScore ?? 0;
    finalRisk = Math.max(finalRisk, risk);

    upsertRoom(sessionId, {
      caseId: sessionId,
      complaint: multimodal.structured?.dominantSignal ?? "unknown",
      status: risk >= 0.7 ? "escalated" : "active",
      riskScore: risk,
      channel: "phone",
    });

    if (risk >= 0.75) {
      yield {
        transcript: text,
        reply: "This sounds like a medical emergency. Please hang up and call 911 immediately, or I can connect you to a physician now.",
        escalate: true,
        caseId: sessionId,
        riskScore: risk,
      };
      return;
    }

    const complaint = (multimodal.structured?.dominantSignal ?? "").replace("text", "").trim();
    const protocol = selectProtocol(complaint);

    if (!protocolStarted && protocol && multimodal.nextStep !== "collect_more") {
      protocolStarted = true;
      const ctx = buildVoiceContext(answers);
      const result = await runExamProtocol(protocol, ctx);

      if (result.escalate) {
        yield {
          transcript: text,
          reply: `Based on the assessment, I am escalating your case to a physician immediately. Reason: ${result.escalateReason ?? "clinical criteria met"}.`,
          escalate: true,
          caseId: sessionId,
          riskScore: risk,
        };
        return;
      }

      const disposition = result.next ?? "standard_care";
      const sysRisk = computeSystemRisk({ caseId: sessionId, latencyMs: 0, errorRate: 0, overrideRate: 0, riskScore: risk, complaint, redFlags: 0 });

      const physician = selectPhysician({ caseId: sessionId, complaint, riskScore: risk });

      yield {
        transcript: text,
        reply: `I have completed your assessment. ${physician ? `Dr. ${physician.physician.name} will review your case shortly.` : "A physician will contact you shortly."} Disposition: ${disposition.replace(/_/g, " ")}.`,
        done: true,
        caseId: sessionId,
        riskScore: risk,
        nextStep: disposition,
      };
      return;
    }

    const reply = generateVoiceReply({ riskScore: risk, nextStep: multimodal.nextStep, complaint });
    yield { transcript: text, reply, caseId: sessionId, riskScore: risk, nextStep: multimodal.nextStep };
  }

  yield {
    reply: "Thank you for using Auralyn. A care team member will follow up with you shortly. If your symptoms worsen, please call 911 or go to your nearest emergency room.",
    done: true,
    caseId: sessionId,
    riskScore: finalRisk,
  };
}

export async function handleAutonomousVoiceCall(req: Request, res: Response): Promise<void> {
  const userId = req.body?.From ?? req.body?.from ?? "unknown";
  const caseId = `voice_${req.body?.CallSid ?? Date.now()}`;
  const speeches: string[] = [];

  const rawSpeech = req.body?.SpeechResult ?? req.body?.speech ?? "";
  if (rawSpeech) speeches.push(rawSpeech);

  const twiml: string[] = [];

  for await (const chunk of runVoiceClinic(speeches.length ? speeches : ["Hello, I need help"], userId, caseId)) {
    const safe = chunk.reply
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    twiml.push(`<Say voice="alice">${safe}</Say>`);
    if (chunk.done || chunk.escalate) break;
  }

  if (twiml.length === 0) {
    twiml.push(`<Say voice="alice">Thank you for calling Auralyn. Please describe your symptoms after the tone.</Say>`);
    twiml.push(`<Record maxLength="30" action="/api/voice/autonomous" />`);
  }

  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response>${twiml.join("")}</Response>`);
}
