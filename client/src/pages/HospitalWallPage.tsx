import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Heart, Thermometer, Wind, Droplets } from "lucide-react";

type StreamVitals = {
  hr:   number;
  bp:   number;
  spo2: number;
  temp: number;
  rr?:  number;
};

type StreamRisk = {
  sepsisRisk:       number;
  shockRisk:        number;
  deteriorating:    boolean;
  alert:            string | null;
  contributingFactors: string[];
};

type Patient = {
  id:        string;
  bed:       string;
  name:      string;
  diagnosis: string;
  vitals:    StreamVitals;
  risk:      StreamRisk;
  alert:     string | null;
  timestamp: number;
};

function riskColor(risk: StreamRisk | undefined, alert: string | null): string {
  if (!risk) return "bg-slate-800 border-slate-700";
  if (alert?.startsWith("CRITICAL")) return "bg-red-950 border-red-600";
  if (alert?.startsWith("WARNING"))  return "bg-amber-950 border-amber-600";
  if (risk.deteriorating)            return "bg-orange-950 border-orange-600";
  return "bg-slate-800 border-slate-700";
}

function RiskBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
           style={{ width: `${(value * 100).toFixed(0)}%` }} />
    </div>
  );
}

function VitalChip({ icon: Icon, value, unit, warn }: {
  icon: any; value: string | number; unit: string; warn?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 text-xs ${warn ? "text-red-400" : "text-slate-300"}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="font-mono">{value}</span>
      <span className="text-slate-500">{unit}</span>
    </div>
  );
}

function PatientCard({ p }: { p: Patient }) {
  const borderClass = riskColor(p.risk, p.alert);
  const sepsisRisk  = p.risk?.sepsisRisk ?? 0;
  const shockRisk   = p.risk?.shockRisk  ?? 0;

  return (
    <div className={`rounded-lg border p-3 ${borderClass} transition-colors duration-700 flex flex-col gap-2`}
         data-testid={`patient-card-${p.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100 truncate">{p.bed}</p>
          <p className="text-xs text-slate-400 truncate">{p.diagnosis}</p>
        </div>
        {p.alert && (
          <AlertTriangle className={`w-4 h-4 shrink-0 ${
            p.alert.startsWith("CRITICAL") ? "text-red-400 animate-pulse" : "text-amber-400"
          }`} />
        )}
      </div>

      {/* Alert banner */}
      {p.alert && (
        <div className={`text-xs px-2 py-0.5 rounded font-semibold truncate ${
          p.alert.startsWith("CRITICAL") ? "bg-red-800 text-red-100" : "bg-amber-800 text-amber-100"
        }`}>
          {p.alert}
        </div>
      )}

      {/* Vitals */}
      <div className="grid grid-cols-2 gap-1">
        <VitalChip icon={Heart}       value={p.vitals.hr}             unit="bpm" warn={p.vitals.hr > 100} />
        <VitalChip icon={Activity}    value={p.vitals.bp}             unit="mmHg" warn={p.vitals.bp < 90} />
        <VitalChip icon={Droplets}    value={p.vitals.spo2}           unit="%" warn={p.vitals.spo2 < 92} />
        <VitalChip icon={Thermometer} value={p.vitals.temp.toFixed(1)} unit="°C" warn={p.vitals.temp > 38.3} />
      </div>

      {/* Risk bars */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-12 shrink-0">Sepsis</span>
          <div className="flex-1">
            <RiskBar value={sepsisRisk}
              color={sepsisRisk > 0.7 ? "bg-red-500" : sepsisRisk > 0.4 ? "bg-amber-500" : "bg-emerald-500"} />
          </div>
          <span className="w-8 text-right font-mono">{(sepsisRisk * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-12 shrink-0">Shock</span>
          <div className="flex-1">
            <RiskBar value={shockRisk}
              color={shockRisk > 0.7 ? "bg-red-500" : shockRisk > 0.4 ? "bg-amber-500" : "bg-emerald-500"} />
          </div>
          <span className="w-8 text-right font-mono">{(shockRisk * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

export default function HospitalWallPage() {
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [connected, setConnected] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);

  // ── Local simulation fallback (when no WebSocket is connected) ──────────────
  function startLocalSim() {
    if (intervalRef.current) return;
    setSimActive(true);

    const BEDS = Array.from({ length: 20 }, (_, i) => ({
      id: `ICU_${String(i+1).padStart(2,"0")}`,
      bed: `ICU-${i+1}`,
      name: `Patient ${i+1}`,
      diagnosis: ["Post-op","CHF","Pneumonia","Sepsis watch","ACS","PE","DKA","Stroke","GI bleed","Hepatic enc."][i % 10],
      criticalPct: i < 4 ? 0.5 : 0.08,
    }));

    function generateFrame() {
      return BEDS.map(p => {
          const crit = Math.random() < p.criticalPct;
          const vitals: StreamVitals = {
            hr:   Math.round(crit ? 105 + Math.random()*40 : 65 + Math.random()*25),
            bp:   Math.round(crit ? 70  + Math.random()*22 : 115 + Math.random()*25),
            spo2: Math.round(crit ? 87  + Math.random()*6  : 96  + Math.random()*4),
            temp: parseFloat((crit ? 38.5 + Math.random()*1.5 : 36.5 + Math.random()).toFixed(1)),
            rr:   Math.round(crit ? 24 + Math.random()*8 : 13 + Math.random()*5),
          };
          const sepsis = Math.min(
            (vitals.temp > 38.3 ? 0.20 : 0) +
            (vitals.hr > 100 ? 0.20 : 0) +
            (vitals.bp < 90 ? 0.30 : 0) +
            ((vitals.rr ?? 0) > 22 ? 0.20 : 0), 1);
          const shock  = Math.min(
            (vitals.bp < 90 ? 0.40 : 0) +
            (vitals.spo2 < 92 ? 0.30 : 0) +
            ((vitals.hr / vitals.bp) > 1.0 ? 0.25 : 0), 1);
          const risk: StreamRisk = {
            sepsisRisk: sepsis, shockRisk: shock,
            deteriorating: sepsis > 0.5 || shock > 0.5,
            alert: shock > 0.7 ? "CRITICAL — Likely Shock"
                 : sepsis > 0.7 ? "CRITICAL — Likely Sepsis"
                 : (sepsis > 0.5 || shock > 0.5) ? "WARNING — Deterioration Detected"
                 : null,
            contributingFactors: [],
          };
          return { ...p, vitals, risk, alert: risk.alert, timestamp: Date.now() };
        });
    }

    // Populate immediately, then refresh on interval
    setPatients(generateFrame());

    intervalRef.current = setInterval(() => {
      setPatients(generateFrame());
    }, 1500);
  }

  function stopLocalSim() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSimActive(false);
  }

  useEffect(() => {
    startLocalSim();
    return () => stopLocalSim();
  }, []);

  const criticalCount = patients.filter(p => p.alert?.startsWith("CRITICAL")).length;
  const warningCount  = patients.filter(p => p.alert?.startsWith("WARNING")).length;
  const stableCount   = patients.length - criticalCount - warningCount;

  return (
    <div className="min-h-screen bg-black text-slate-100 p-3 flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">Auralyn ICU Wall</span>
          <div className="flex items-center gap-1.5 ml-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">{simActive ? "LIVE SIM" : connected ? "LIVE" : "OFFLINE"}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-red-400 font-semibold">
            {criticalCount > 0 ? `🚨 ${criticalCount} CRITICAL` : ""}
          </span>
          <span className="text-amber-400">
            {warningCount > 0 ? `⚠ ${warningCount} WARNING` : ""}
          </span>
          <span className="text-emerald-400 text-xs">{stableCount} stable</span>
          <span className="text-slate-600 text-xs">{patients.length} patients</span>
          <button
            data-testid="button-toggle-sim"
            onClick={simActive ? stopLocalSim : startLocalSim}
            className={`text-xs px-3 py-1 rounded border ${
              simActive
                ? "border-emerald-700 text-emerald-400 hover:bg-emerald-950"
                : "border-slate-700 text-slate-400 hover:bg-slate-900"
            }`}
          >
            {simActive ? "Stop Sim" : "Start Sim"}
          </button>
        </div>
      </div>

      {/* Patient grid */}
      {patients.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-600">
          <div className="text-center">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-semibold">No patients in stream</p>
            <p className="text-sm mt-1">Start simulation or connect WebSocket</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 flex-1">
          {patients
            .sort((a, b) => {
              const aMax = Math.max(a.risk?.sepsisRisk ?? 0, a.risk?.shockRisk ?? 0);
              const bMax = Math.max(b.risk?.sepsisRisk ?? 0, b.risk?.shockRisk ?? 0);
              return bMax - aMax;
            })
            .map(p => <PatientCard key={p.id} p={p} />)}
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-slate-700 text-center">
        Auralyn Medical AI — ICU Hospital Wall Display • Real-time deterioration scoring
      </div>
    </div>
  );
}
