/**
 * @auralyn/clinical-engine
 *
 * DB-free, framework-agnostic implementation of Auralyn's 13-step clinical
 * triage pipeline. Import, supply rules + patient inputs, get a full trace.
 */

export * from "./types";
export * from "./pipeline";
export { evaluateRule, executePipeline, computeConfidence, extractTopDiagnoses } from "./engine";
