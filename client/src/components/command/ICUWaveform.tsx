import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Heart, Thermometer, TrendingUp } from "lucide-react";
import type { PatientRow } from "./MultiPatientGrid";
import { cn } from "@/lib/utils";

interface Props {
  patient: PatientRow;
}

function generateWaveform(baseVal: number, points = 20, variance = 3): number[] {
  const seed = baseVal;
  return Array.from({ length: points }, (_, i) => {
    const noise = (Math.sin(i * 0.7 + seed) * variance) + (Math.random() * variance * 0.5 - variance * 0.25);
    return Math.round((baseVal + noise) * 10) / 10;
  });
}

interface WaveformDataPoint {
  time: string;
  hr?: number;
  spo2?: number;
  sbp?: number;
  temp?: number;
}

export default function ICUWaveform({ patient }: Props) {
  const vitals = patient.vitals ?? {};

  const data = useMemo<WaveformDataPoint[]>(() => {
    const points = 20;
    const hrWave   = vitals.hr   ? generateWaveform(vitals.hr,   points, 6) : null;
    const spo2Wave = vitals.spo2 ? generateWaveform(vitals.spo2, points, 1.5) : null;
    const sbpWave  = vitals.sbp  ? generateWaveform(vitals.sbp,  points, 8) : null;
    const tempWave = vitals.temp ? generateWaveform(vitals.temp, points, 0.3) : null;

    return Array.from({ length: points }, (_, i) => {
      const minutesAgo = points - i - 1;
      const d: WaveformDataPoint = { time: minutesAgo === 0 ? "Now" : `-${minutesAgo}m` };
      if (hrWave)   d.hr   = hrWave[i];
      if (spo2Wave) d.spo2 = spo2Wave[i];
      if (sbpWave)  d.sbp  = sbpWave[i];
      if (tempWave) d.temp = tempWave[i];
      return d;
    });
  }, [patient.patient_id]);

  const hasHr   = !!vitals.hr;
  const hasSpo2 = !!vitals.spo2;
  const hasSbp  = !!vitals.sbp;
  const hasTemp = !!vitals.temp;

  const isHrAlarm   = vitals.hr   && (vitals.hr > 120 || vitals.hr < 50);
  const isSpo2Alarm = vitals.spo2 && vitals.spo2 < 92;
  const isSbpAlarm  = vitals.sbp  && vitals.sbp < 90;
  const isTempAlarm = vitals.temp && vitals.temp >= 39;

  return (
    <div className="p-4 space-y-4">
      {/* Live vitals status row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {hasHr && (
          <div className={cn("rounded border p-2 text-center", isHrAlarm ? "border-red-500/40 bg-red-500/10" : "border-border/50 bg-muted/20")}>
            <Heart size={14} className={cn("mx-auto mb-1", isHrAlarm ? "text-red-400" : "text-pink-400")} />
            <div className={cn("text-xl font-black", isHrAlarm ? "text-red-400" : "text-foreground")}>{vitals.hr}</div>
            <div className="text-[10px] text-muted-foreground">HR bpm</div>
            {isHrAlarm && <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30 mt-0.5">ALARM</Badge>}
          </div>
        )}
        {hasSpo2 && (
          <div className={cn("rounded border p-2 text-center", isSpo2Alarm ? "border-red-500/40 bg-red-500/10" : "border-border/50 bg-muted/20")}>
            <Activity size={14} className={cn("mx-auto mb-1", isSpo2Alarm ? "text-red-400" : "text-green-400")} />
            <div className={cn("text-xl font-black", isSpo2Alarm ? "text-red-400" : "text-foreground")}>{vitals.spo2}%</div>
            <div className="text-[10px] text-muted-foreground">SpO₂</div>
            {isSpo2Alarm && <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30 mt-0.5">ALARM</Badge>}
          </div>
        )}
        {hasSbp && (
          <div className={cn("rounded border p-2 text-center", isSbpAlarm ? "border-red-500/40 bg-red-500/10" : "border-border/50 bg-muted/20")}>
            <TrendingUp size={14} className={cn("mx-auto mb-1", isSbpAlarm ? "text-red-400" : "text-blue-400")} />
            <div className={cn("text-xl font-black", isSbpAlarm ? "text-red-400" : "text-foreground")}>{vitals.sbp}</div>
            <div className="text-[10px] text-muted-foreground">SBP mmHg</div>
            {isSbpAlarm && <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30 mt-0.5">ALARM</Badge>}
          </div>
        )}
        {hasTemp && (
          <div className={cn("rounded border p-2 text-center", isTempAlarm ? "border-orange-500/40 bg-orange-500/10" : "border-border/50 bg-muted/20")}>
            <Thermometer size={14} className={cn("mx-auto mb-1", isTempAlarm ? "text-orange-400" : "text-yellow-400")} />
            <div className={cn("text-xl font-black", isTempAlarm ? "text-orange-400" : "text-foreground")}>{vitals.temp}°C</div>
            <div className="text-[10px] text-muted-foreground">Temp</div>
            {isTempAlarm && <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/30 mt-0.5">FEVER</Badge>}
          </div>
        )}
      </div>

      {/* HR Waveform */}
      {hasHr && (
        <Card className="p-3 border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Heart size={12} className="text-red-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Heart Rate (bpm)</span>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" dot={false} strokeWidth={2} name="HR" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* SpO₂ Waveform */}
      {hasSpo2 && (
        <Card className="p-3 border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={12} className="text-green-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SpO₂ (%)</span>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} domain={[85, 100]} />
              <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
              <Line type="monotone" dataKey="spo2" stroke="#22c55e" dot={false} strokeWidth={2} name="SpO₂" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* SBP + Temp combined */}
      {(hasSbp || hasTemp) && (
        <Card className="p-3 border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={12} className="text-blue-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SBP / Temp Trend</span>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
              {hasSbp  && <Line type="monotone" dataKey="sbp"  stroke="#60a5fa" dot={false} strokeWidth={2} name="SBP" />}
              {hasTemp && <Line type="monotone" dataKey="temp" stroke="#fb923c" dot={false} strokeWidth={2} name="Temp °C" />}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {Object.keys(vitals).length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          No vitals data available for this patient
        </div>
      )}
    </div>
  );
}
