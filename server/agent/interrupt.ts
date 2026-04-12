export interface InterruptEvent {
  type: "physician_override" | "safety_halt" | "escalation_required" | "timeout";
  message: string;
  actorId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

let _interruptFlag = false;
let _interruptEvent: InterruptEvent | null = null;
const _interruptHistory: InterruptEvent[] = [];

export function triggerInterrupt(
  event: Omit<InterruptEvent, "timestamp">
): void {
  _interruptFlag  = true;
  _interruptEvent = { ...event, timestamp: new Date() };
  _interruptHistory.push(_interruptEvent);
}

export function checkInterrupt(): { stop: boolean; event: InterruptEvent | null } {
  if (_interruptFlag) {
    const event    = _interruptEvent;
    _interruptFlag  = false;
    _interruptEvent = null;
    return { stop: true, event };
  }
  return { stop: false, event: null };
}

export function clearInterrupt(): void {
  _interruptFlag  = false;
  _interruptEvent = null;
}

export function getInterruptHistory(): InterruptEvent[] {
  return [..._interruptHistory];
}

export function isInterruptPending(): boolean {
  return _interruptFlag;
}
