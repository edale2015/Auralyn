/**
 * LLM Insight Engine — GPT-4o-mini per-patient clinical AI overlay
 * Returns risk level, recommended next action, and priority tier.
 */

import type { VitalSnapshot } from "../engines/interventionEngine";

let _openai: any = null;

function getOpenAI() {
  if (!_openai) {
    const { OpenAI } = require("openai");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export interface AIInsight {
  risk:     string;
  action:   string;
  priority: "low" | "medium" | "high" | "critical";
  rationale:string;
  fromCache?:boolean;
}

// In-memory cache keyed by vitals fingerprint (avoids re-calling per 2s tick)
const insightCache = new Map<string, { insight: AIInsight; at: number }>();
const CACHE_TTL_MS = 30_000;  // 30 seconds per unique vitals snapshot

function fingerprint(patientId: string, v: VitalSnapshot): string {
  return `${patientId}:${Math.round(v.hr / 5)}:${Math.round(v.spo2)}:${Math.round(v.temp)}:${Math.round(v.systolicBP / 5)}`;
}

export async function generatePatientInsight(patientId: string, name: string, v: VitalSnapshot): Promise<AIInsight> {
  const key = fingerprint(patientId, v);
  const cached = insightCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.insight, fromCache: true };
  }

  const prompt = `You are a clinical AI assistant in a hospital emergency department.

Patient: ${name}
Vitals:
  Heart Rate: ${v.hr} bpm
  SpO₂: ${v.spo2}%
  Temperature: ${v.temp}°F
  Systolic BP: ${v.systolicBP} mmHg

Analyze this patient concisely. Respond ONLY with valid JSON matching exactly:
{
  "risk": "<brief risk description, max 10 words>",
  "action": "<single most important next action, max 15 words>",
  "priority": "low" | "medium" | "high" | "critical",
  "rationale": "<clinical reasoning, max 20 words>"
}`;

  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AIInsight;

    // Validate priority
    if (!["low", "medium", "high", "critical"].includes(parsed.priority)) {
      parsed.priority = "medium";
    }

    insightCache.set(key, { insight: parsed, at: Date.now() });
    return parsed;

  } catch {
    // Fallback: rule-based insight when LLM fails
    const fallback: AIInsight = {
      risk:      v.spo2 < 92 ? "Critical hypoxia" : v.hr > 120 ? "Severe tachycardia" : "Vitals being assessed",
      action:    v.spo2 < 92 ? "Apply supplemental oxygen immediately" : v.hr > 120 ? "Order ECG and troponin" : "Continue monitoring",
      priority:  v.spo2 < 92 || v.systolicBP < 90 ? "critical" : v.hr > 120 ? "high" : "medium",
      rationale: "Rule-based fallback — LLM unavailable",
    };
    insightCache.set(key, { insight: fallback, at: Date.now() });
    return fallback;
  }
}
