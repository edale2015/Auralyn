export interface CommunicationTrace {
  patientId: string;
  complaint: string;
  visitCount: number;
  demandDetected: boolean;
  bacterialCriteria: boolean;
  tone: string;
  scriptVariant: string;
  decision: "NO_ANTIBIOTIC" | "DELAYED_RX" | "ANTIBIOTIC_GIVEN";
  reasoning: string[];
  timestamp: Date;
}

const _traceStore: CommunicationTrace[] = [];

export function buildCommunicationTrace(input: {
  patientId: string;
  complaint: string;
  visitCount: number;
  demandDetected: boolean;
  bacterialCriteria: boolean;
  tone: string;
  scriptVariant: string;
}): CommunicationTrace {
  const reasoning: string[] = [];

  if (input.demandDetected)      reasoning.push("Patient requested antibiotics");
  if (!input.bacterialCriteria)  reasoning.push("No bacterial criteria met");
  if (input.visitCount >= 3)     reasoning.push("Repeat visit pattern");
  if (input.bacterialCriteria)   reasoning.push("Bacterial criteria confirmed");

  const decision: CommunicationTrace["decision"] = input.bacterialCriteria
    ? "ANTIBIOTIC_GIVEN"
    : input.demandDetected
    ? "DELAYED_RX"
    : "NO_ANTIBIOTIC";

  const trace: CommunicationTrace = {
    ...input,
    decision,
    reasoning,
    timestamp: new Date(),
  };

  _traceStore.push(trace);
  return trace;
}

export function getStoredTraces(): CommunicationTrace[] {
  return [..._traceStore];
}

export function clearTraces(): void {
  _traceStore.length = 0;
}
