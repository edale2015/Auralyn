/**
 * Agent Loop — Gather → Skills → Agent Council → Verify → Hook Override
 * The core clinical reasoning pipeline for a single patient.
 * Returns full trace for audit replay.
 */

import { runSkills }            from "../controlTower/skillRunner";
import { runAgentCouncil }      from "../agents/agentCouncil";
import { preDispositionHook }   from "../hooks/preDisposition";
import { generateInterventions } from "../intervention/autonomousCopilot";
import { buildCopilotCards }    from "../intervention/copilotDecision";
import { detectSepsisRisk }     from "../sepsis/sepsisEngine";

export interface AgentLoopInput {
  id:          string;
  vitals:      Record<string, any>;
  symptoms?:   string[];
  complaint?:  string;
  redFlags?:   string[];
  level?:      string;
  history?:    any[];
  context?:    Record<string, any>;
}

export interface AgentLoopResult {
  patientId:      string;
  phase:          "gather" | "act" | "verify" | "complete";
  skillResults:   ReturnType<typeof runSkills>;
  sepsisRisk:     ReturnType<typeof detectSepsisRisk>;
  agentCouncil:   ReturnType<typeof runAgentCouncil>;
  interventions:  Awaited<ReturnType<typeof generateInterventions>>;
  copilotCards:   ReturnType<typeof buildCopilotCards>;
  finalDecision:  ReturnType<typeof preDispositionHook>;
  durationMs:     number;
  trace:          Array<{ phase: string; at: string; result: any }>;
}

export async function runAgentLoop(patient: AgentLoopInput): Promise<AgentLoopResult> {
  const t0    = Date.now();
  const trace: AgentLoopResult["trace"] = [];
  const tag   = (phase: string, result: any) => trace.push({ phase, at: new Date().toISOString(), result });

  // ── 1. GATHER ─────────────────────────────────────────────────────────────
  const skillResults = runSkills(patient);
  tag("gather:skills", { skillsRun: skillResults.skillsRun, flags: skillResults.highRiskFlags });

  const sepsisRisk = detectSepsisRisk({
    id:       patient.id,
    vitals:   { ...patient.vitals, systolicBP: patient.vitals.systolicBP ?? patient.vitals.sbp ?? 120 },
    symptoms: patient.symptoms ?? [],
    labs:     patient.context?.labs ?? {},
  });
  tag("gather:sepsis", { probability: sepsisRisk.probability, highRisk: sepsisRisk.highRisk });

  // ── 2. ACT ────────────────────────────────────────────────────────────────
  const agentCouncil = runAgentCouncil({ ...patient, sepsisRisk });
  tag("act:council", { top: agentCouncil.topDecision?.recommendation, consensus: agentCouncil.consensusLevel });

  const interventions = await generateInterventions({ ...patient, sepsisRisk } as any);
  tag("act:interventions", { count: interventions.length, types: interventions.map((i) => i.type) });

  const copilotCards = buildCopilotCards(patient.id, interventions);

  // ── 3. VERIFY / HOOK ──────────────────────────────────────────────────────
  const agentDecision = agentCouncil.topDecision;
  const finalDecision = preDispositionHook(
    { patientId: patient.id, redFlags: patient.redFlags, vitals: patient.vitals as any, level: patient.level },
    { disposition: agentDecision?.recommendation ?? "OBSERVE", confidence: agentDecision?.confidence, reason: agentDecision?.reason }
  );
  tag("verify:hooks", { overridden: finalDecision.overridden, hooks: finalDecision.appliedHooks });

  return {
    patientId:    patient.id,
    phase:        "complete",
    skillResults,
    sepsisRisk,
    agentCouncil,
    interventions,
    copilotCards,
    finalDecision,
    durationMs:   Date.now() - t0,
    trace,
  };
}
