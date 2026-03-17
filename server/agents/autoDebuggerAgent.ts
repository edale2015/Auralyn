import { eventBus, SystemEvent } from "../realtime/eventBus";
import { getSystemHealth } from "../realtime/systemHealthMonitor";
import { memoryEngine } from "../engines/memoryEngine";

export interface DebugAction {
  id: string;
  type: "restart" | "reroute" | "adjust" | "alert" | "fix";
  target: string;
  details: string;
  severity: "info" | "warning" | "critical";
  timestamp: number;
  resolved: boolean;
}

export class AutoDebuggerAgent {
  private actions: DebugAction[] = [];
  private maxActions = 200;
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;

    eventBus.subscribe((event: SystemEvent) => {
      if (event.type === "error") this.handleError(event);
      if (event.type === "reasoning") this.detectAnomaly(event);
    });

    this.scanSystem();
    setInterval(() => this.scanSystem(), 10000);
  }

  private handleError(event: SystemEvent) {
    this.dispatch({
      type: "restart",
      target: event.source,
      details: `Error in ${event.source}: ${event.payload?.error || "unknown"}`,
      severity: "critical",
    });
    memoryEngine.store("debug_error", event.source, { error: event.payload?.error, timestamp: event.timestamp });
  }

  private detectAnomaly(event: SystemEvent) {
    const duration = event.payload?.duration;
    if (duration > 2000) {
      this.dispatch({
        type: "adjust",
        target: event.source,
        details: `High latency detected: ${duration}ms — optimization recommended`,
        severity: "warning",
      });
    }
  }

  private scanSystem() {
    const health = getSystemHealth();
    health.forEach((s) => {
      if (s.status === "down") {
        this.dispatch({
          type: "restart",
          target: s.name,
          details: `${s.name} is down — automatic restart triggered`,
          severity: "critical",
        });
      } else if (s.status === "warning") {
        this.dispatch({
          type: "alert",
          target: s.name,
          details: `${s.name} showing warning status (latency: ${s.latency}ms)`,
          severity: "warning",
        });
      }
    });
  }

  private dispatch(params: Omit<DebugAction, "id" | "timestamp" | "resolved">) {
    const action: DebugAction = {
      ...params,
      id: `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      resolved: false,
    };
    this.actions.unshift(action);
    if (this.actions.length > this.maxActions) this.actions = this.actions.slice(0, this.maxActions);
    memoryEngine.store("debug_action", action.id, action);
  }

  getActions(limit: number = 50): DebugAction[] {
    return this.actions.slice(0, limit);
  }

  getSummary() {
    return {
      totalActions: this.actions.length,
      byType: {
        restart: this.actions.filter((a) => a.type === "restart").length,
        reroute: this.actions.filter((a) => a.type === "reroute").length,
        adjust: this.actions.filter((a) => a.type === "adjust").length,
        alert: this.actions.filter((a) => a.type === "alert").length,
        fix: this.actions.filter((a) => a.type === "fix").length,
      },
      bySeverity: {
        info: this.actions.filter((a) => a.severity === "info").length,
        warning: this.actions.filter((a) => a.severity === "warning").length,
        critical: this.actions.filter((a) => a.severity === "critical").length,
      },
      running: this.running,
    };
  }

  resolveAction(id: string): boolean {
    const action = this.actions.find((a) => a.id === id);
    if (action) { action.resolved = true; return true; }
    return false;
  }
}

export const autoDebuggerAgent = new AutoDebuggerAgent();
