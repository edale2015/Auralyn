/**
 * usePatientStream — real-time WebSocket hook for live patient data
 * Connects to /ws/patients and stays reconnected on drop.
 */
import { useEffect, useState, useRef, useCallback } from "react";

export interface LiveVitals {
  hr:         number;
  spo2:       number;
  temp:       number;
  systolicBP: number;
  bp?:        string;
}

export interface LiveDeterioration {
  newsScore:      number;
  riskLevel:      "low" | "medium" | "high" | "critical";
  sepsisCriteria: boolean;
  prediction:     string;
}

export interface LiveIntervention {
  type:     "lab" | "med" | "escalation" | "monitor";
  action:   string;
  priority: "low" | "medium" | "high" | "critical";
  rationale:string;
}

export interface LivePatient {
  id:            number;
  name:          string;
  age:           number;
  condition:     string;
  vitals:        LiveVitals;
  status:        "stable" | "warning" | "critical";
  deterioration: LiveDeterioration;
  interventions: LiveIntervention[];
  priorityScore: number;
  lastUpdated:   string;
}

export interface PatientStreamState {
  patients:      LivePatient[];
  connected:     boolean;
  tick:          number;
  criticalCount: number;
  lastReceived:  string | null;
}

export function usePatientStream(): PatientStreamState {
  const [state, setState] = useState<PatientStreamState>({ patients: [], connected: false, tick: 0, criticalCount: 0, lastReceived: null });
  const wsRef   = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws    = new WebSocket(`${proto}//${window.location.host}/ws/patients`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "PATIENT_UPDATE" && Array.isArray(msg.patients)) {
          setState((s) => ({
            ...s,
            patients:      msg.patients,
            tick:          msg.tick   ?? s.tick,
            criticalCount: msg.criticalCount ?? 0,
            lastReceived:  new Date().toISOString(),
          }));
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      // Auto-reconnect after 2 seconds
      timerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
