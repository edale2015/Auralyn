import type { TraceEvent, TraceStep } from "../../shared/testingTypes";

export function pushEvent(events: TraceEvent[], e: TraceEvent) {
  events.push(e);
}

export function pushStep(steps: TraceStep[], s: TraceStep) {
  steps.push(s);
}
