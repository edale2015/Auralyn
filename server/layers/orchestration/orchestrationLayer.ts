import { interfaceLayer, RawInput } from "../interface/interfaceLayer";
import { normalizationLayer } from "../normalization/normalizationLayer";
import { stateLayer } from "../state/stateLayer";
import { knowledgeLayer } from "../knowledge/knowledgeLayer";
import { safetyLayer } from "../safety/safetyLayer";
import { reasoningLayer } from "../reasoning/reasoningLayer";
import { decisionLayer } from "../decision/decisionLayer";
import { eventBus } from "../../realtime/eventBus";
import { updateService } from "../../realtime/systemHealthMonitor";

export interface BrainRunResult {
  caseId: string;
  decision: any;
  safety: any;
  diagnoses: any;
  reasoning: any;
  trace: { layer: string; durationMs: number }[];
  totalDurationMs: number;
  timestamp: number;
}

function track(name: string, category: string, fn: () => any) {
  const start = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - start;
    updateService(name, category, duration);
    eventBus.emitEvent({
      type: "reasoning",
      source: name,
      payload: { duration, success: true },
      timestamp: Date.now(),
    });
    return { result, duration };
  } catch (err: any) {
    const duration = Date.now() - start;
    updateService(name, category, duration, true);
    eventBus.emitEvent({
      type: "error",
      source: name,
      payload: { duration, error: err.message },
      timestamp: Date.now(),
    });
    throw err;
  }
}

export class OrchestrationLayer {
  run(input: RawInput): BrainRunResult {
    const totalStart = Date.now();
    const trace: { layer: string; durationMs: number }[] = [];

    const { result: interfaceResult, duration: d1 } = track("Interface Layer", "layer", () =>
      interfaceLayer.receive(input)
    );
    trace.push({ layer: "interface", durationMs: d1 });

    const { result: normalized, duration: d2 } = track("Normalization Layer", "layer", () =>
      normalizationLayer.normalize(interfaceResult)
    );
    trace.push({ layer: "normalization", durationMs: d2 });

    const caseId = `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { result: caseState, duration: d3 } = track("State Layer", "layer", () =>
      stateLayer.createCase(caseId)
    );
    trace.push({ layer: "state", durationMs: d3 });

    const { result: diagnoses, duration: d4 } = track("Knowledge Layer", "layer", () =>
      knowledgeLayer.getDiagnoses(normalized.symptoms)
    );
    trace.push({ layer: "knowledge", durationMs: d4 });

    const { result: safety, duration: d5 } = track("Safety Layer", "layer", () =>
      safetyLayer.check(normalized.symptoms)
    );
    trace.push({ layer: "safety", durationMs: d5 });

    if (safety.flag) {
      eventBus.emitEvent({
        type: "safety",
        source: "Safety Layer",
        payload: { level: safety.level, action: safety.action, reasons: safety.reasons },
        timestamp: Date.now(),
      });
    }

    const { result: reasoning, duration: d6 } = track("Reasoning Layer", "layer", () =>
      reasoningLayer.run(normalized.symptoms, diagnoses)
    );
    trace.push({ layer: "reasoning", durationMs: d6 });

    const { result: decision, duration: d7 } = track("Decision Layer", "layer", () =>
      decisionLayer.decide(reasoning, safety)
    );
    trace.push({ layer: "decision", durationMs: d7 });

    stateLayer.updateCase(caseId, "decision", decision);
    stateLayer.setStatus(caseId, "decided");

    eventBus.emitEvent({
      type: "decision",
      source: "Orchestration Layer",
      payload: { caseId, decision, safety: safety.flag ? safety.level : "none" },
      timestamp: Date.now(),
    });

    const totalDuration = Date.now() - totalStart;
    updateService("Orchestration Layer", "layer", totalDuration);

    return {
      caseId,
      decision,
      safety,
      diagnoses,
      reasoning,
      trace,
      totalDurationMs: totalDuration,
      timestamp: Date.now(),
    };
  }
}

export const orchestrationLayer = new OrchestrationLayer();
