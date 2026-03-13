import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const DISPOSITION_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 border-blue-200",
  discharged: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-50 border-red-200 text-red-800",
  urgent: "bg-amber-50 border-amber-200 text-amber-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-700",
  major: "bg-orange-50 border-orange-200 text-orange-800",
  moderate: "bg-yellow-50 border-yellow-200 text-yellow-700",
  minor: "bg-slate-50 border-slate-200 text-slate-700",
};

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  urgent: "🟠",
  warning: "🟡",
  major: "🟠",
  moderate: "🟡",
  minor: "⚪",
};

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function safe(val: any, fb = ""): string {
  if (val === null || val === undefined) return fb;
  return String(val);
}

function safeArr(val: any): any[] {
  return Array.isArray(val) ? val : [];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <button
      data-testid="button-copy-text"
      onClick={copy}
      className="rounded-lg border px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function Badge({ label, variant = "default" }: { label: string; variant?: string }) {
  const cls = DISPOSITION_COLORS[variant] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function SectionTitle({ children }: { children: string }) {
  return <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-500">{children}</div>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

type Session = {
  caseId: string;
  startedAt: string;
  updatedAt: string;
  status: string;
  complaint?: string;
  disposition?: string;
  differential?: { diagnosis: string; confidence: number }[];
  safetyAlerts?: string[];
  redFlags?: string[];
  checkedSymptoms?: string[];
  medicationSuggestions?: string[];
  medicationAlerts?: string[];
  icdCodes?: { code: string; description: string }[];
  cptCodes?: { code: string; description: string; rvu?: number }[];
  returnPrecautions?: string[];
  noteGenerated?: { hpi: string; assessment: string; plan: string; disposition: string };
  patientMessages?: string[];
};

function SessionCard({ session, selected, onClick }: { session: Session; selected: boolean; onClick: () => void }) {
  const hasAlerts = (session.redFlags?.length ?? 0) > 0 || (session.safetyAlerts?.length ?? 0) > 0;
  return (
    <button
      data-testid={`button-session-${session.caseId}`}
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition-all shadow-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate ${selected ? "text-white" : "text-slate-900"}`}>
            {session.caseId}
          </div>
          <div className={`text-xs mt-0.5 ${selected ? "text-slate-300" : "text-slate-500"}`}>
            {safe(session.complaint, "no complaint").replace(/_/g, " ")} · {elapsed(session.updatedAt)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${selected ? "bg-white/20 border-white/40 text-white" : DISPOSITION_COLORS[session.status] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
            {session.status}
          </span>
          {hasAlerts && (
            <span className={`text-xs font-bold ${selected ? "text-red-300" : "text-red-600"}`}>⚠ Alerts</span>
          )}
        </div>
      </div>
      {session.differential && session.differential.length > 0 && (
        <div className={`mt-2 text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>
          Top Dx: {session.differential[0].diagnosis}
        </div>
      )}
    </button>
  );
}

function QuickAnalysisPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [disposition, setDisposition] = useState("");
  const [patientText, setPatientText] = useState("");
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];
  const DISPOSITIONS = ["Home Care", "Prescription", "Urgent Care", "ED", "Telehealth Follow-up"];
  const SYMPTOM_MAP: Record<string, string[]> = {
    cough: ["Fever", "Shortness of breath", "Chest pain", "Sputum production", "Night symptoms"],
    sore_throat: ["Fever", "Difficulty swallowing", "Exudate", "No cough", "Ear pain"],
    uti: ["Dysuria", "Frequency", "Urgency", "Hematuria", "Fever/chills", "Flank pain"],
    chest_pain: ["Shortness of breath", "Diaphoresis", "Radiation to arm/jaw", "Pleuritic"],
    fever: ["Cough", "Sore throat", "Rash", "Confusion", "Neck stiffness"],
    ear_pain: ["Fever", "Discharge", "Recent URI", "Hearing loss"],
    rash: ["Fever", "Spreading", "Blistering", "Itching"],
    sinus_pressure: ["Facial pain", "Duration > 10 days", "Purulent discharge", "Fever"],
    abdominal_pain: ["Nausea/vomiting", "Diarrhea", "Fever", "RLQ pain", "Rebound"],
  };

  function toggleSym(s: string) {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function analyze() {
    if (!complaint) return;
    setRunning(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/telemed/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: sessionId, complaint, symptoms, disposition, patientText }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Analysis failed");
      setResult(d);
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
    } catch (e: any) { setError(e.message); } finally { setRunning(false); }
  }

  const symOptions = SYMPTOM_MAP[complaint] ?? [];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Complaint & Symptoms</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {COMPLAINTS.map(c => (
            <button key={c} data-testid={`button-quick-complaint-${c}`} onClick={() => { setComplaint(c); setSymptoms([]); }}
              className={`rounded-xl border px-2 py-1.5 text-xs font-medium transition-all ${complaint === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"}`}>
              {c.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {symOptions.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {symOptions.map(s => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 hover:text-slate-900">
                <input type="checkbox" data-testid={`checkbox-quick-${s.replace(/\s+/g, "-").toLowerCase()}`}
                  checked={symptoms.includes(s)} onChange={() => toggleSym(s)} className="h-3.5 w-3.5 rounded" />
                {s}
              </label>
            ))}
          </div>
        )}
        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-500 mb-1">Disposition</div>
          <div className="flex flex-wrap gap-1.5">
            {DISPOSITIONS.map(d => (
              <button key={d} data-testid={`button-disposition-${d.replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => setDisposition(d)}
                className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition-all ${disposition === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <textarea data-testid="textarea-quick-patient-text" value={patientText} onChange={e => setPatientText(e.target.value)}
          rows={2} placeholder="Patient description (optional)…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none mb-3" />
        <button data-testid="button-quick-analyze" onClick={analyze} disabled={running || !complaint}
          className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-40">
          {running ? "Analyzing…" : "Run Analysis"}
        </button>
        {error && <div className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      </Panel>

      {result && (
        <>
          {safeArr(result.safetyAlerts).length > 0 && (
            <Panel>
              <SectionTitle>Safety Alerts</SectionTitle>
              <div className="space-y-2">
                {safeArr(result.safetyAlerts).map((a: any, i: number) => (
                  <div key={i} data-testid={`text-safety-alert-${i}`}
                    className={`rounded-xl border p-2.5 text-xs ${SEVERITY_COLORS[a.severity] ?? "bg-slate-50 border-slate-200 text-slate-700"}`}>
                    <div className="font-bold">{SEVERITY_ICON[a.severity] ?? "⚪"} {a.message}</div>
                    <div className="mt-1 text-xs opacity-90">{a.recommendation}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {safeArr(result.differential).length > 0 && (
            <Panel>
              <SectionTitle>Live Differential</SectionTitle>
              <ol className="space-y-2">
                {safeArr(result.differential).slice(0, 5).map((d: any, i: number) => (
                  <li key={i} data-testid={`text-dashboard-differential-${i}`} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{d.diagnosis}</div>
                      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${Math.min(100, d.confidence * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{(d.confidence * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function SessionDetailPanel({ session }: { session: Session }) {
  const qc = useQueryClient();
  const [noteData, setNoteData] = useState<any>(null);
  const [dischargeData, setDischargeData] = useState<any>(null);
  const [genningNote, setGenningNote] = useState(false);
  const [genningDisch, setGenningDisch] = useState(false);
  const [tab, setTab] = useState<"overview" | "meds" | "codes" | "precautions" | "note" | "discharge">("overview");

  async function generateNote() {
    setGenningNote(true);
    try {
      const r = await fetch(`/api/telemed/note/${session.caseId}`, { method: "POST" });
      const d = await r.json();
      if (d.ok) setNoteData(d.note);
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
    } finally { setGenningNote(false); }
  }

  async function generateDischarge() {
    setGenningDisch(true);
    try {
      const r = await fetch(`/api/telemed/discharge/${session.caseId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (d.ok) setDischargeData(d);
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
    } finally { setGenningDisch(false); }
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "meds", label: "Medications" },
    { id: "codes", label: "ICD / CPT" },
    { id: "precautions", label: "Precautions" },
    { id: "note", label: "Chart Note" },
    { id: "discharge", label: "Discharge" },
  ] as const;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-bold text-slate-900">{session.caseId}</div>
            <div className="text-sm text-slate-500">
              {safe(session.complaint, "no complaint").replace(/_/g, " ")} · Started {elapsed(session.startedAt)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={session.status} variant={session.status} />
            {session.disposition && <Badge label={session.disposition} />}
            {(session.redFlags?.length ?? 0) > 0 && (
              <span className="rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                ⚠ {session.redFlags!.length} Red Flag{session.redFlags!.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </Panel>

      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} data-testid={`button-tab-${t.id}`} onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${tab === t.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {safeArr(session.safetyAlerts).length > 0 && (
            <Panel>
              <SectionTitle>Safety Alerts</SectionTitle>
              <div className="space-y-1.5">
                {session.safetyAlerts!.map((a, i) => (
                  <div key={i} data-testid={`text-alert-${i}`} className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-800">
                    <span>⚠</span><span>{a}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {safeArr(session.differential).length > 0 && (
            <Panel>
              <SectionTitle>Differential Diagnosis</SectionTitle>
              <ol className="space-y-2">
                {session.differential!.map((d, i) => (
                  <li key={i} data-testid={`text-detail-differential-${i}`} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{d.diagnosis}</div>
                      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${Math.min(100, d.confidence * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{(d.confidence * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {safeArr(session.checkedSymptoms).length > 0 && (
            <Panel>
              <SectionTitle>Checked Symptoms</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {session.checkedSymptoms!.map(s => (
                  <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{s}</span>
                ))}
              </div>
            </Panel>
          )}

          {safeArr(session.patientMessages).length > 0 && (
            <Panel>
              <SectionTitle>Patient Messages</SectionTitle>
              <div className="space-y-2">
                {session.patientMessages!.slice(0, 5).map((m, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800">
                    {m}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === "meds" && (
        <div className="space-y-4">
          {safeArr(session.medicationAlerts).length > 0 && (
            <Panel>
              <SectionTitle>Medication Safety Alerts</SectionTitle>
              <div className="space-y-2">
                {session.medicationAlerts!.map((a, i) => (
                  <div key={i} data-testid={`text-med-alert-${i}`} className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-800">
                    <span className="font-bold">⚠ </span>{a}
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {safeArr(session.medicationSuggestions).length > 0 && (
            <Panel>
              <SectionTitle>Suggested Medications</SectionTitle>
              <div className="space-y-2">
                {session.medicationSuggestions!.map((m, i) => (
                  <div key={i} data-testid={`text-med-${i}`} className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800">
                    <span className="mt-0.5 text-green-600 shrink-0">💊</span>
                    <span>{m}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                Always confirm allergies, weight, renal function, and current medications before prescribing.
              </div>
            </Panel>
          )}
          {safeArr(session.medicationSuggestions).length === 0 && safeArr(session.medicationAlerts).length === 0 && (
            <Panel><div className="text-sm text-slate-400">Run analysis to generate medication recommendations.</div></Panel>
          )}
        </div>
      )}

      {tab === "codes" && (
        <div className="space-y-4">
          {safeArr(session.icdCodes).length > 0 && (
            <Panel>
              <SectionTitle>ICD-10 Diagnosis Codes</SectionTitle>
              <div className="space-y-2">
                {session.icdCodes!.map((c, i) => (
                  <div key={i} data-testid={`text-icd-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                    <div>
                      <span className="font-mono text-sm font-bold text-slate-900">{c.code}</span>
                      <div className="text-xs text-slate-500 mt-0.5">{c.description}</div>
                    </div>
                    <CopyButton text={c.code} />
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {safeArr(session.cptCodes).length > 0 && (
            <Panel>
              <SectionTitle>CPT Procedure Codes</SectionTitle>
              <div className="space-y-2">
                {session.cptCodes!.map((c, i) => (
                  <div key={i} data-testid={`text-cpt-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                    <div>
                      <span className="font-mono text-sm font-bold text-slate-900">{c.code}</span>
                      <div className="text-xs text-slate-500 mt-0.5">{c.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.rvu && <span className="text-xs text-slate-400">{c.rvu} RVU</span>}
                      <CopyButton text={c.code} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {safeArr(session.icdCodes).length === 0 && (
            <Panel><div className="text-sm text-slate-400">ICD-10/CPT codes appear once complaint and disposition are set.</div></Panel>
          )}
        </div>
      )}

      {tab === "precautions" && (
        <div className="space-y-4">
          {safeArr(session.returnPrecautions).length > 0 && (
            <Panel>
              <SectionTitle>Return Precautions (ER Indicators)</SectionTitle>
              <div className="space-y-1.5">
                {session.returnPrecautions!.map((p, i) => (
                  <div key={i} data-testid={`text-precaution-${i}`} className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-sm text-amber-800">
                    <span className="shrink-0">⚠</span><span>{p}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {safeArr(session.returnPrecautions).length === 0 && (
            <Panel><div className="text-sm text-slate-400">Set complaint and disposition to generate return precautions.</div></Panel>
          )}
        </div>
      )}

      {tab === "note" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Chart Note</SectionTitle>
              <button data-testid="button-generate-note" onClick={generateNote} disabled={genningNote}
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-all">
                {genningNote ? "Generating…" : "Generate Note"}
              </button>
            </div>
            {(noteData ?? session.noteGenerated) ? (
              <div className="space-y-3">
                {[
                  { label: "HPI", value: (noteData ?? session.noteGenerated)?.hpi },
                  { label: "Assessment", value: (noteData ?? session.noteGenerated)?.assessment },
                  { label: "Plan", value: (noteData ?? session.noteGenerated)?.plan },
                  { label: "Disposition", value: (noteData ?? session.noteGenerated)?.disposition },
                ].map(({ label, value }) => value ? (
                  <div key={label}>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
                    <div data-testid={`text-note-${label.toLowerCase()}`} className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-800 whitespace-pre-wrap">{value}</div>
                  </div>
                ) : null)}
                <CopyButton text={[(noteData ?? session.noteGenerated)?.hpi, (noteData ?? session.noteGenerated)?.assessment, (noteData ?? session.noteGenerated)?.plan].filter(Boolean).join("\n\n")} />
              </div>
            ) : (
              <div className="text-sm text-slate-400">Click Generate Note to create a chart note from this session.</div>
            )}
          </Panel>
        </div>
      )}

      {tab === "discharge" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Discharge Instructions</SectionTitle>
              <button data-testid="button-generate-discharge" onClick={generateDischarge} disabled={genningDisch || session.status === "discharged"}
                className="rounded-xl bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50 transition-all">
                {genningDisch ? "Generating…" : session.status === "discharged" ? "Discharged" : "One-Click Discharge"}
              </button>
            </div>
            {dischargeData ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-green-700 mb-2">WhatsApp / Telegram Message</div>
                  <div data-testid="text-discharge-message" className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {dischargeData.dischargeMessage}
                  </div>
                </div>
                <CopyButton text={dischargeData.dischargeMessage} />
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  This session has been marked as discharged. Copy the message above and send via WhatsApp or Telegram.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-slate-500 mb-3">
                  One-click discharge generates a formatted patient message ready to copy and send via WhatsApp or Telegram. It includes:
                </div>
                {["Diagnosis summary", "Treatment instructions", "Return precautions (when to go to ER)", "Follow-up recommendations"].map(i => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-green-600">✓</span>{i}
                  </div>
                ))}
                {(!session.complaint || !session.disposition) && (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    Set complaint and disposition first by running an analysis.
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

export default function TelemedicineDoctorDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [newId, setNewId] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: sessionData, isLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ["/api/telemed/sessions"],
    refetchInterval: 15000,
  });

  const { data: allData } = useQuery<{ sessions: Session[] }>({
    queryKey: ["/api/telemed/sessions/all"],
    enabled: showAll,
  });

  const qc = useQueryClient();

  const sessions = showAll ? (allData?.sessions ?? []) : (sessionData?.sessions ?? []);
  const selected = sessions.find(s => s.caseId === selectedId) ?? null;

  async function startNewSession() {
    if (!newId.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/telemed/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: newId.trim() }),
      });
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
      setSelectedId(newId.trim());
      setNewId("");
    } finally { setCreating(false); }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Telemedicine Doctor Dashboard</h1>
            <p className="text-sm text-slate-500">Live sessions · Medication safety · ICD/CPT · One-click discharge</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600">{sessionData?.sessions.length ?? 0} active</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[340px_1fr_1fr]">

          {/* LEFT — Session list */}
          <div className="space-y-4">
            <Panel>
              <SectionTitle>New Session</SectionTitle>
              <div className="flex gap-2">
                <input data-testid="input-new-session-id" value={newId} onChange={e => setNewId(e.target.value)}
                  placeholder="Case ID (e.g. TG-2025-001)"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  onKeyDown={e => e.key === "Enter" && startNewSession()} />
                <button data-testid="button-start-session" onClick={startNewSession} disabled={creating || !newId.trim()}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition-all">
                  {creating ? "…" : "Start"}
                </button>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>Sessions</SectionTitle>
                <button data-testid="button-toggle-show-all" onClick={() => setShowAll(!showAll)}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
                  {showAll ? "Active only" : "Show all"}
                </button>
              </div>
              {isLoading && <div className="text-sm text-slate-400">Loading…</div>}
              {sessions.length === 0 && !isLoading && (
                <div className="text-sm text-slate-400">No {showAll ? "" : "active "}sessions. Start one above.</div>
              )}
              <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                {sessions.map(s => (
                  <SessionCard key={s.caseId} session={s} selected={selectedId === s.caseId} onClick={() => setSelectedId(s.caseId)} />
                ))}
              </div>
            </Panel>
          </div>

          {/* MIDDLE — Quick analysis */}
          {selectedId ? (
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto space-y-4 pr-1">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">Quick Analysis</div>
              <QuickAnalysisPanel sessionId={selectedId} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border bg-white text-sm text-slate-400 shadow-sm" style={{ minHeight: 300 }}>
              Select or start a session to begin
            </div>
          )}

          {/* RIGHT — Session details */}
          {selected ? (
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto space-y-4 pr-1">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">Session Details</div>
              <SessionDetailPanel session={selected} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border bg-white text-sm text-slate-400 shadow-sm" style={{ minHeight: 300 }}>
              Session details appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
