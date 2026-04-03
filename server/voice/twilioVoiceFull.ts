import type { Request, Response } from "express";
import { handleVoiceStream } from "../multimodal/voiceAgent";
import { trace } from "../lib/traceLogger";
import { scrubText } from "../middleware/phiScrubber";

interface TwilioStreamEvent {
  event: string;
  streamSid?: string;
  callSid?: string;
  media?: { payload: string; timestamp: string; chunk: string };
}

function createMockStream(speechText: string): AsyncIterable<Buffer> {
  const chunks = speechText
    .split(" ")
    .map((word) => Buffer.from(JSON.stringify({ event: "media", media: { payload: Buffer.from(word).toString("base64") } })));

  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined };
          await new Promise((r) => setTimeout(r, 50));
          return { done: false, value: chunks[i++] };
        },
      };
    },
  };
}

export async function handleTwilioMediaStream(req: Request, res: Response): Promise<void> {
  const callSid = req.body?.CallSid ?? req.body?.callSid ?? "unknown";
  const userId = req.body?.From ?? req.body?.from ?? callSid;
  const speechText = req.body?.SpeechResult ?? req.body?.speechResult ?? "";

  trace("twilio_voice_full", "stream_started", { callSid, userId });

  const stream = createMockStream(speechText);

  const twiml: string[] = [];
  let tokenCount = 0;
  let escalate = false;

  for await (const chunk of handleVoiceStream(stream, { userId, channel: "phone" })) {
    tokenCount++;

    if (chunk.escalate) {
      escalate = true;
      twiml.push(
        `<Say voice="alice">This is a medical emergency. Please hang up and call 911 immediately.</Say>`
      );
      break;
    }

    if (chunk.text) {
      const { scrubbed, redactedCount } = scrubText(chunk.text);
      if (redactedCount > 0) {
        trace("twilio_voice_full", "phi_redacted_from_tts", { callSid, redactedCount });
      }
      twiml.push(`<Say voice="alice">${escapeXml(scrubbed)}</Say>`);
    }

    if (chunk.done) break;
  }

  if (!escalate && twiml.length === 0) {
    twiml.push(`<Say voice="alice">We are reviewing your case. A physician will contact you shortly.</Say>`);
  }

  twiml.push(`<Pause length="1"/>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${twiml.join("")}</Response>`;

  trace("twilio_voice_full", "stream_complete", { callSid, tokenCount, escalate, responseLength: xml.length });

  res.set("Content-Type", "text/xml");
  res.send(xml);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function handleTwilioStatus(req: Request, res: Response): Promise<void> {
  const callSid = req.body?.CallSid ?? "unknown";
  const status = req.body?.CallStatus ?? "unknown";

  trace("twilio_voice_full", "call_status", { callSid, status });

  res.sendStatus(204);
}
