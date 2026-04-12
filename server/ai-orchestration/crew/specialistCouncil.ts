/**
 * Specialist Council — TypeScript-native multi-agent consultation
 * Equivalent of CrewAI's sequential crew pattern, built on parallel GPT-4o-mini calls.
 * Specialists: Cardiology · Infectious Disease · ICU / Critical Care
 */

let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const { OpenAI } = require("openai");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export interface SpecialistAgent {
  role:       string;
  specialty:  string;
  backstory:  string;
  goal:       string;
}

export interface SpecialistOpinion {
  specialist: string;
  risk:       string;
  assessment: string;
  recommendation: string;
  priority:   "low" | "medium" | "high" | "critical";
  cached?:    boolean;
}

export interface CouncilResult {
  specialists:   SpecialistOpinion[];
  consensus:     string;
  finalRisk:     "low" | "medium" | "high" | "critical";
  disposition:   string;
  durationMs:    number;
  processType:   "sequential";
}

const SPECIALISTS: SpecialistAgent[] = [
  {
    role:      "Cardiologist",
    specialty: "cardiology",
    backstory: "Expert in ACS, arrhythmias, CHF, pericarditis, and aortic emergencies.",
    goal:      "Evaluate cardiac risk and identify any cardiac emergencies requiring urgent intervention.",
  },
  {
    role:      "Infectious Disease Specialist",
    specialty: "infectious disease",
    backstory: "Expert in sepsis, septic shock, viral vs bacterial differentiation, and antimicrobial stewardship.",
    goal:      "Evaluate infection risk and determine likelihood and severity of systemic infection.",
  },
  {
    role:      "ICU / Critical Care Physician",
    specialty: "critical care",
    backstory: "Expert in shock states, respiratory failure, hemodynamic instability, and multi-organ dysfunction.",
    goal:      "Assess risk of imminent clinical deterioration requiring ICU-level care.",
  },
];

// Per-specialist cache (30s TTL per case fingerprint)
const opinionCache = new Map<string, { opinion: SpecialistOpinion; at: number }>();
const CACHE_TTL = 30_000;

function caseKey(role: string, caseData: string): string {
  return `${role}:${caseData.slice(0, 60)}`;
}

async function consultSpecialist(agent: SpecialistAgent, caseData: string): Promise<SpecialistOpinion> {
  const key    = caseKey(agent.role, caseData);
  const cached = opinionCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return { ...cached.opinion, cached: true };
  }

  const prompt = `You are a ${agent.role} in an emergency department.

Your background: ${agent.backstory}
Your goal: ${agent.goal}

Patient Case:
${caseData}

Respond in valid JSON only:
{
  "risk": "<brief risk description, max 10 words>",
  "assessment": "<clinical assessment from your specialty perspective, max 25 words>",
  "recommendation": "<single most important action, max 15 words>",
  "priority": "low" | "medium" | "high" | "critical"
}`;

  try {
    const res = await getOpenAI().chat.completions.create({
      model:       "gpt-4o-mini",
      messages:    [{ role: "user", content: prompt }],
      max_tokens:  200,
      temperature: 0.15,
      response_format: { type: "json_object" },
    });

    const raw    = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (!["low","medium","high","critical"].includes(parsed.priority)) parsed.priority = "medium";

    const opinion: SpecialistOpinion = {
      specialist:     agent.role,
      risk:           parsed.risk      ?? "Assessment pending",
      assessment:     parsed.assessment ?? "Review required",
      recommendation: parsed.recommendation ?? "Continue monitoring",
      priority:       parsed.priority,
    };

    opinionCache.set(key, { opinion, at: Date.now() });
    return opinion;

  } catch {
    return {
      specialist:     agent.role,
      risk:           "Unable to assess — LLM error",
      assessment:     "Rule-based fallback applied",
      recommendation: "Escalate to senior clinician",
      priority:       "high",
    };
  }
}

function deriveConsensus(opinions: SpecialistOpinion[]): { consensus: string; finalRisk: CouncilResult["finalRisk"]; disposition: string } {
  const priorities = opinions.map((o) => o.priority);
  const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  const maxPriority    = priorities.reduce((a, b) => priorityWeight[a] >= priorityWeight[b] ? a : b);

  const criticalCount = priorities.filter((p) => p === "critical").length;
  const highCount     = priorities.filter((p) => p === "high").length;

  let disposition = "urgent care";
  if (criticalCount >= 1 || maxPriority === "critical") disposition = "ICU / ER immediately";
  else if (highCount >= 2)                               disposition = "ER";
  else if (maxPriority === "high")                       disposition = "ER";
  else if (maxPriority === "medium")                     disposition = "urgent care";
  else                                                   disposition = "home with follow-up";

  const consensus = `Council of 3 specialists reached ${maxPriority.toUpperCase()} risk consensus. ` +
    `${criticalCount > 0 ? `${criticalCount} specialist(s) flagged CRITICAL. ` : ""}` +
    `Recommended disposition: ${disposition}.`;

  return { consensus, finalRisk: maxPriority as CouncilResult["finalRisk"], disposition };
}

export async function runSpecialistCouncil(caseData: string): Promise<CouncilResult> {
  const start = Date.now();

  // Run all 3 specialists in parallel (like CrewAI sequential but concurrent in TS)
  const specialists = await Promise.all(
    SPECIALISTS.map((agent) => consultSpecialist(agent, caseData))
  );

  const { consensus, finalRisk, disposition } = deriveConsensus(specialists);

  return {
    specialists,
    consensus,
    finalRisk,
    disposition,
    durationMs:  Date.now() - start,
    processType: "sequential",
  };
}
