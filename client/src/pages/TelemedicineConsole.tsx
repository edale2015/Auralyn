import { useState, useRef, useCallback } from "react";

const COMPLAINTS = [
  { id: "cough", label: "Cough", emoji: "🫁" },
  { id: "sore_throat", label: "Sore Throat", emoji: "🦷" },
  { id: "sinus_pressure", label: "Sinus / Congestion", emoji: "👃" },
  { id: "ear_pain", label: "Ear Pain", emoji: "👂" },
  { id: "uti", label: "UTI Symptoms", emoji: "🔬" },
  { id: "rash", label: "Rash / Skin", emoji: "🩹" },
  { id: "fever", label: "Fever", emoji: "🌡" },
  { id: "chest_pain", label: "Chest Pain", emoji: "❤️" },
  { id: "abdominal_pain", label: "Abdominal Pain", emoji: "🫃" },
];

const QUICK_SYMPTOMS: Record<string, string[]> = {
  cough: ["Fever", "Shortness of breath", "Chest pain", "Sputum production", "Night symptoms", "Duration > 7 days"],
  sore_throat: ["Fever", "Difficulty swallowing", "Swollen glands", "Ear pain", "White patches", "No cough"],
  sinus_pressure: ["Facial pain", "Nasal discharge", "Duration > 10 days", "Fever", "Tooth pain", "Headache"],
  ear_pain: ["Fever", "Ear discharge", "Hearing loss", "Recent URI", "Tugging at ear", "Sore throat"],
  uti: ["Dysuria", "Frequency", "Urgency", "Hematuria", "Fever/chills", "Flank pain", "Pregnancy"],
  rash: ["Fever", "Spreading", "Blistering", "Itching", "Recent sick contact", "Travel history"],
  fever: ["Cough", "Sore throat", "Rash", "Neck stiffness", "Confusion", "Duration > 5 days", "Immunocompromised"],
  chest_pain: ["Shortness of breath", "Diaphoresis", "Radiation to arm/jaw", "Pleuritic", "Palpitations", "Syncope"],
  abdominal_pain: ["Nausea / vomiting", "Diarrhea", "Fever", "Rebound tenderness", "Last menstrual period", "Blood in stool"],
};

const DISPOSITION_COLORS: Record<string, string> = {
  er_now: "bg-red-100 text-red-800 border-red-200",
  er_send: "bg-red-100 text-red-800 border-red-200",
  urgent_care: "bg-amber-100 text-amber-800 border-amber-200",
  routine: "bg-green-100 text-green-800 border-green-200",
  routine_evaluation: "bg-green-100 text-green-800 border-green-200",
  home_care: "bg-blue-100 text-blue-800 border-blue-200",
  telehealth_followup: "bg-blue-100 text-blue-800 border-blue-200",
};

const DISPOSITION_LABELS: Record<string, string> = {
  er_now: "⚠ ER — IMMEDIATELY",
  er_send: "⚠ ER — Send Now",
  urgent_care: "Urgent Care Today",
  routine: "Routine Follow-up",
  routine_evaluation: "Routine Evaluation",
  home_care: "Home Care",
  telehealth_followup: "Telehealth Follow-up",
};

function safe(val: any, fallback = "") {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

function safeArr(val: any): any[] {
  return Array.isArray(val) ? val : [];
}

export default function TelemedicineConsole() {
  const [selectedComplaint, setSelectedComplaint] = useState<string>("");
  const [rawText, setRawText] = useState("");
  const [checkedSymptoms, setCheckedSymptoms] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setRawText(transcript);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  function pickComplaint(id: string) {
    setSelectedComplaint(id);
    setCheckedSymptoms(new Set());
    setResult(null);
    setError("");
    const label = COMPLAINTS.find((c) => c.id === id)?.label ?? id;
    setRawText(`Patient presents with ${label.toLowerCase()}.`);
  }

  function toggleSymptom(sym: string) {
    setCheckedSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }

  function buildRawText() {
    const base = rawText || `Patient presents with ${selectedComplaint.replace(/_/g, " ")}.`;
    const syms = Array.from(checkedSymptoms);
    if (syms.length === 0) return base;
    return `${base} Reports: ${syms.join(", ")}.`;
  }

  async function runAnalysis() {
    if (!selectedComplaint && !rawText.trim()) return;
    try {
      setRunning(true);
      setError("");
      setResult(null);

      const res = await fetch("/api/skill-layer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: `TM_${Date.now()}`,
          rawText: buildRawText(),
          modifiers: {
            complaint_override: selectedComplaint || undefined,
          },
          siteId: "default",
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data.state);
    } catch (err: any) {
      setError(err.message ?? "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  function buildNoteText() {
    if (!result) return "";
    const sr = result.skillResults ?? {};
    const complaint = safe(sr.identify_chief_complaint?.result?.complaint_id, selectedComplaint).replace(/_/g, " ");
    const hpi = safe(sr.generate_assessment_plan?.result?.hpi_text ?? sr.normalize_patient_story?.result?.normalized_text, buildRawText());
    const assessment = safe(sr.generate_assessment_plan?.result?.assessment_text ?? sr.generate_differential?.result?.reasoning_summary, "");
    const plan = safe(sr.generate_assessment_plan?.result?.plan_text ?? sr.generate_physician_review_packet?.result?.plan_summary, "");
    const disposition = safe(result.finalDisposition ?? sr.determine_disposition?.result?.disposition, "");

    return [
      `CHIEF COMPLAINT: ${complaint}`,
      "",
      `HPI: ${hpi}`,
      "",
      `ASSESSMENT: ${assessment}`,
      "",
      `PLAN: ${plan}`,
      "",
      `DISPOSITION: ${DISPOSITION_LABELS[disposition] ?? disposition}`,
    ].join("\n");
  }

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(buildNoteText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  const sr = result?.skillResults ?? {};
  const complaint = safe(sr.identify_chief_complaint?.result?.complaint_id, selectedComplaint);
  const disposition = safe(result?.finalDisposition ?? sr.determine_disposition?.result?.disposition, "");
  const redFlags = safeArr(sr.detect_red_flags?.result?.triggered_flags ?? sr.detect_red_flags?.result?.red_flags);
  const differential = safeArr(sr.generate_differential?.result?.differential_list).slice(0, 6);
  const questions = safeArr(
    sr.run_complaint_question_bundle?.result?.next_questions ??
    sr.select_next_best_question?.result?.questions ??
    sr.run_complaint_question_bundle?.result?.questions
  ).slice(0, 8);
  const hpi = safe(sr.generate_assessment_plan?.result?.hpi_text ?? sr.normalize_patient_story?.result?.normalized_text, "");
  const assessment = safe(sr.generate_assessment_plan?.result?.assessment_text ?? sr.generate_differential?.result?.reasoning_summary, "");
  const plan = safe(sr.generate_assessment_plan?.result?.plan_text ?? sr.generate_physician_review_packet?.result?.plan_summary, "");
  const discharge = safe(sr.generate_physician_review_packet?.result?.patient_instructions ?? sr.generate_assessment_plan?.result?.discharge_text, "");
  const scores = sr.apply_clinical_score?.result;

  const quickSymptoms = QUICK_SYMPTOMS[selectedComplaint] ?? [];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Telemedicine Visit Copilot</h1>
            <p className="text-sm text-slate-500">Live clinical reasoning — runs in parallel with the visit</p>
          </div>
          {result && (
            <div
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                DISPOSITION_COLORS[disposition] ?? "bg-slate-100 text-slate-700 border-slate-200"
              }`}
              data-testid="text-disposition-badge"
            >
              {(DISPOSITION_LABELS[disposition] ?? disposition) || "Pending"}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">

          {/* LEFT — INPUT PANEL */}
          <div className="space-y-5">
            {/* Complaint picker */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-700">Chief Complaint</div>
              <div className="grid grid-cols-3 gap-2">
                {COMPLAINTS.map((c) => (
                  <button
                    key={c.id}
                    data-testid={`button-complaint-${c.id}`}
                    onClick={() => pickComplaint(c.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs font-medium transition-all ${
                      selectedComplaint === c.id
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-lg">{c.emoji}</span>
                    <span className="text-center leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Symptom checklist */}
            {quickSymptoms.length > 0 && (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-700">Quick Symptom Check</div>
                <div className="space-y-2">
                  {quickSymptoms.map((sym) => (
                    <label
                      key={sym}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        data-testid={`checkbox-symptom-${sym.replace(/\s+/g, "-").toLowerCase()}`}
                        checked={checkedSymptoms.has(sym)}
                        onChange={() => toggleSymptom(sym)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-800">{sym}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Free text + voice */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">Patient Description</div>
                <button
                  data-testid="button-voice-input"
                  onClick={toggleVoice}
                  title={listening ? "Stop listening" : "Start voice input"}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    listening
                      ? "bg-red-100 text-red-700 animate-pulse"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 1 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 1 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12H5z" />
                  </svg>
                  {listening ? "Listening…" : "Voice"}
                </button>
              </div>
              <textarea
                data-testid="textarea-patient-description"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={4}
                className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none ${
                  listening ? "border-red-300 bg-red-50" : "border-slate-200"
                }`}
                placeholder="Patient says: 'I've had a cough and fever for 3 days...'"
              />
            </div>

            {/* Analyze button */}
            <button
              data-testid="button-run-analysis"
              onClick={runAnalysis}
              disabled={running || (!selectedComplaint && !rawText.trim())}
              className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-40"
            >
              {running ? "Analyzing…" : "Run Clinical Analysis"}
            </button>

            {error && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* RIGHT — RESULTS PANEL */}
          <div className="space-y-5">
            {!result && !running && (
              <div className="flex h-64 items-center justify-center rounded-2xl border bg-white text-sm text-slate-400 shadow-sm">
                Select a complaint and click Run Clinical Analysis
              </div>
            )}

            {running && (
              <div className="flex h-64 items-center justify-center rounded-2xl border bg-white text-sm text-slate-500 shadow-sm">
                <div className="text-center">
                  <div className="mb-2 text-lg">🔍</div>
                  Running 18-skill clinical pipeline…
                </div>
              </div>
            )}

            {result && (
              <>
                {/* Red flags */}
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-700">Red Flag Safety Check</div>
                    {redFlags.length > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {redFlags.length} triggered
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Clear
                      </span>
                    )}
                  </div>
                  {redFlags.length === 0 ? (
                    <div className="text-sm text-slate-500">No red flags triggered</div>
                  ) : (
                    <div className="space-y-1.5">
                      {redFlags.map((flag: any, idx: number) => (
                        <div
                          key={idx}
                          data-testid={`text-red-flag-${idx}`}
                          className="flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800"
                        >
                          <span className="mt-0.5 shrink-0">⚠</span>
                          <span>{typeof flag === "string" ? flag : (flag.flag ?? flag.description ?? JSON.stringify(flag))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Two-column: differential + questions */}
                <div className="grid gap-5 md:grid-cols-2">
                  {/* Differential */}
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-700">Differential Diagnosis</div>
                    {differential.length === 0 ? (
                      <div className="text-sm text-slate-400">Not available</div>
                    ) : (
                      <ol className="space-y-2">
                        {differential.map((dx: any, idx: number) => {
                          const name = typeof dx === "string" ? dx : (dx.diagnosis ?? dx.name ?? dx.complaint_id ?? JSON.stringify(dx));
                          const conf = typeof dx === "object" ? Number(dx.confidence ?? dx.score ?? 0) : 0;
                          return (
                            <li
                              key={idx}
                              data-testid={`text-differential-${idx}`}
                              className="flex items-center gap-3"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-slate-800">{name}</div>
                                {conf > 0 && (
                                  <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100">
                                    <div
                                      className="h-1.5 rounded-full bg-slate-400"
                                      style={{ width: `${Math.min(100, conf * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  {/* Next questions */}
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-700">Suggested Next Questions</div>
                    {questions.length === 0 ? (
                      <div className="text-sm text-slate-400">No additional questions</div>
                    ) : (
                      <ul className="space-y-2">
                        {questions.map((q: any, idx: number) => {
                          const text = typeof q === "string" ? q : (q.question_text ?? q.text ?? q.question ?? JSON.stringify(q));
                          return (
                            <li
                              key={idx}
                              data-testid={`text-question-${idx}`}
                              className="flex items-start gap-2 text-sm text-slate-700"
                            >
                              <span className="mt-0.5 shrink-0 text-slate-400">•</span>
                              <span>{text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Clinical scores */}
                {scores && Object.keys(scores).length > 0 && (
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-700">Clinical Scores</div>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(scores).map(([k, v]: [string, any]) => {
                        if (typeof v === "object") return null;
                        return (
                          <div key={k} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-700">{k.replace(/_/g, " ").toUpperCase()}</span>
                            <span className="ml-2 font-bold text-slate-900">{String(v)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Chart note */}
                <div className="rounded-2xl border bg-white p-4 shadow-sm" ref={noteRef}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-700">Auto-Generated Chart Note</div>
                    <button
                      data-testid="button-copy-note"
                      onClick={copyNote}
                      className="rounded-xl border px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</div>
                      <div
                        data-testid="text-note-complaint"
                        className="text-slate-800"
                      >
                        {complaint.replace(/_/g, " ")}
                      </div>
                    </div>

                    {hpi && (
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">HPI</div>
                        <div data-testid="text-note-hpi" className="text-slate-800">{hpi}</div>
                      </div>
                    )}

                    {assessment && (
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Assessment</div>
                        <div data-testid="text-note-assessment" className="text-slate-800">{assessment}</div>
                      </div>
                    )}

                    {plan && (
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</div>
                        <div data-testid="text-note-plan" className="text-slate-800">{plan}</div>
                      </div>
                    )}

                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Disposition</div>
                      <span
                        data-testid="text-note-disposition"
                        className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold ${
                          DISPOSITION_COLORS[disposition] ?? "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {DISPOSITION_LABELS[disposition] ?? disposition}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Discharge instructions */}
                {discharge && (
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-700">Discharge Instructions</div>
                    <div
                      data-testid="text-discharge-instructions"
                      className="whitespace-pre-wrap text-sm text-slate-700"
                    >
                      {discharge}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
