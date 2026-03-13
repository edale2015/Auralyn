import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type ConversationMessage = {
  id: string
  sender: "patient" | "doctor" | "system"
  text: string
  timestamp: string
}

type AssistantResult = {
  complaint?: string
  triage?: { level: string; reason?: string }
  differential?: { diagnosis: string; score: number }[]
  nextQuestions?: string[]
  resources?: { recommendedActions?: { diagnosis: string; priority?: string }[] }
  contradictions?: { diagnosis: string; conflict: string }[]
}

type CannedMessage = {
  id: string
  label: string
  text: string
  category: "intake" | "clarify" | "reassure" | "escalate" | "close"
}

type ConversationState = {
  caseId: string
  conversation: ConversationMessage[]
  draftReply: string
  status: "active" | "completed" | "discharged"
  updatedAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPLAINT_CHIPS = [
  "cough", "sore throat", "UTI symptoms", "rash", "ear pain",
  "sinus pressure", "fever", "chest pain", "abdominal pain",
]

const CANNED_CATEGORY_COLORS: Record<string, string> = {
  intake:   "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  clarify:  "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
  reassure: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  escalate: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  close:    "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
}

function triageBadgeClass(level?: string) {
  const l = (level ?? "").toLowerCase()
  if (l.includes("stat") || l.includes("critical") || l.includes("emergent")) return "bg-red-600 text-white"
  if (l.includes("urgent")) return "bg-orange-500 text-white"
  if (l.includes("semi")) return "bg-amber-400 text-white"
  return "bg-green-500 text-white"
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 60 ? "bg-blue-500" : pct >= 35 ? "bg-amber-400" : "bg-gray-300"
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 bg-gray-100 rounded h-1.5">
        <div className={cn("h-1.5 rounded transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground">{pct}%</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RapidTelemedicineConsole() {
  const [caseId] = useState(`visit_${Date.now()}`)
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState("Ready")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastCopied, setLastCopied] = useState<"" | "note" | "discharge">("")
  const [selectedQ] = useState(0)
  const [patientInput, setPatientInput] = useState("")
  const [draftTouched, setDraftTouched] = useState(false)

  const qc = useQueryClient()
  const convBottomRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Server state ────────────────────────────────────────────────────────────

  const { data: convData } = useQuery<ConversationState>({
    queryKey: ["/api/telemed/session", caseId, "conversation"],
    queryFn: () => fetch(`/api/telemed/session/${caseId}/conversation`).then((r) => r.json()),
    refetchInterval: 3000,
  })

  const { data: cannedData } = useQuery<{ messages: CannedMessage[] }>({
    queryKey: ["/api/telemed/canned-messages"],
    queryFn: () => fetch("/api/telemed/canned-messages").then((r) => r.json()),
    staleTime: Infinity,
  })

  const conversation = convData?.conversation ?? []
  const cannedMessages = cannedData?.messages ?? []

  useEffect(() => {
    convBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversation.length])

  useEffect(() => {
    if (convData?.draftReply && !draftTouched) setDraft(convData.draftReply)
  }, [convData?.draftReply])

  // ── Mutations ───────────────────────────────────────────────────────────────

  const sendPatientMsg = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/telemed/session/${caseId}/patient-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setPatientInput("")
      qc.invalidateQueries({ queryKey: ["/api/telemed/session", caseId, "conversation"] })
    },
  })

  const sendDoctorReply = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/telemed/session/${caseId}/doctor-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setDraft("")
      setDraftTouched(false)
      setStatus("Reply sent")
      qc.invalidateQueries({ queryKey: ["/api/telemed/session", caseId, "conversation"] })
    },
  })

  // ── Analyze ─────────────────────────────────────────────────────────────────

  const analyze = useCallback(async (forceText?: string) => {
    const text = forceText ?? conversation.map((m) => m.text).join(" ")
    if (!text.trim()) return
    try {
      setIsAnalyzing(true)
      setStatus("Analyzing…")
      const res = await fetch("/api/telemed/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, message: text }),
      })
      const data = await res.json()
      setResult(data.result)
      if (data.draft && !draftTouched) setDraft(data.draft)
      setStatus("Updated")
      qc.invalidateQueries({ queryKey: ["/api/telemed/session", caseId, "conversation"] })
    } catch (e: any) {
      setStatus(e?.message ?? "Error")
    } finally {
      setIsAnalyzing(false)
    }
  }, [caseId, conversation, draftTouched])

  // Auto-analyze 600 ms after a new patient message arrives
  useEffect(() => {
    const last = conversation[conversation.length - 1]
    if (!last || last.sender !== "patient") return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => analyze(last.text), 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [conversation.length])

  // ── Live note & discharge ────────────────────────────────────────────────────

  const note = useMemo(() => {
    const history = conversation.filter((m) => m.sender === "patient").map((m) => m.text).join(" ")
    return `Chief Complaint:\n${result?.complaint ?? ""}\n\nHistory:\n${history}\n\nAssessment:\n${
      result?.differential?.[0]?.diagnosis ?? ""
    }\n\nPlan:\n${
      result?.resources?.recommendedActions?.map((a) => a.diagnosis).join("\n") ?? ""
    }\n\nDisposition:\n${result?.triage?.level ?? ""}`
  }, [conversation, result])

  const discharge = useMemo(() => {
    return `Your symptoms are most consistent with:\n\n${
      result?.differential?.[0]?.diagnosis ?? ""
    }\n\nRecommended care:\n${
      result?.resources?.recommendedActions?.map((a) => a.diagnosis).join("\n") ?? ""
    }\n\nReturn immediately if:\n- worsening shortness of breath\n- severe chest pain\n- persistent high fever\n\nFollow up as advised.`
  }, [result])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === "Enter") { e.preventDefault(); analyze(); return }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); copyText("note", note); return }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); copyText("discharge", discharge); return }
      if (mod && e.key.toLowerCase() === "r") {
        e.preventDefault()
        if (draft.trim()) sendDoctorReply.mutate(draft)
        return
      }
      if (e.altKey) {
        const idx = parseInt(e.key) - 1
        const questions = result?.nextQuestions ?? []
        if (!isNaN(idx) && idx >= 0 && idx < questions.length) {
          e.preventDefault()
          setDraft(questions[idx])
          setDraftTouched(true)
          draftRef.current?.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [analyze, draft, result, note, discharge])

  async function copyText(kind: "note" | "discharge", text: string) {
    await navigator.clipboard.writeText(text).catch(() => {})
    setLastCopied(kind)
    setStatus(`Copied ${kind}`)
    setTimeout(() => setLastCopied(""), 1500)
  }

  function insertIntoDraft(text: string) {
    setDraft((d) => (d.trim() ? `${d}\n${text}` : text))
    setDraftTouched(true)
    draftRef.current?.focus()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">⚡ Rapid Telemed</span>
          <Badge variant="outline" className="font-mono text-[10px]">{caseId}</Badge>
          {result?.triage?.level && (
            <Badge className={cn("text-xs", triageBadgeClass(result.triage.level))}>
              {result.triage.level}
            </Badge>
          )}
          {result?.complaint && (
            <Badge variant="secondary" className="text-xs capitalize">{result.complaint}</Badge>
          )}
          {result?.contradictions?.length ? (
            <Badge className="bg-amber-400 text-white text-xs">
              ⚠ {result.contradictions.length} contradiction{result.contradictions.length > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-mono",
              isAnalyzing ? "bg-blue-50 text-blue-600" : "bg-muted text-muted-foreground"
            )}
          >
            {isAnalyzing ? "⟳ analyzing…" : status}
          </span>
          <span className="text-[10px] text-muted-foreground hidden lg:block">
            Ctrl+Enter · Ctrl+R send · Ctrl+N note · Ctrl+D discharge · Alt+1–9 question
          </span>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden divide-x">

        {/* ── LEFT: Live conversation + canned messages + draft reply ── */}
        <div className="flex flex-col w-[38%] min-w-0 overflow-hidden">

          {/* Conversation thread (auto-refreshes every 3 s) */}
          <ScrollArea className="flex-1 px-3 py-2">
            {conversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-1">
                <span className="text-2xl">💬</span>
                <span>No messages yet</span>
                <span className="text-xs">Paste a patient message below to start</span>
              </div>
            ) : (
              conversation.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "mb-3 flex",
                    msg.sender === "doctor"
                      ? "justify-end"
                      : msg.sender === "system"
                      ? "justify-center"
                      : "justify-start"
                  )}
                >
                  {msg.sender === "system" ? (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {msg.text}
                    </span>
                  ) : (
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm",
                        msg.sender === "doctor"
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-card border rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
                      <p
                        className={cn(
                          "text-[10px] mt-1",
                          msg.sender === "doctor" ? "text-blue-200 text-right" : "text-muted-foreground"
                        )}
                      >
                        {formatTime(msg.timestamp)} · {msg.sender}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={convBottomRef} />
          </ScrollArea>

          {/* Patient message input (simulate Telegram / WhatsApp) */}
          <div className="px-3 py-2 border-t bg-muted/30 shrink-0">
            <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
              Simulate patient message
            </p>
            <div className="flex gap-1.5">
              <Textarea
                data-testid="input-patient-message"
                rows={2}
                placeholder="Paste patient text from Telegram / WhatsApp…"
                value={patientInput}
                onChange={(e) => setPatientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    if (patientInput.trim()) sendPatientMsg.mutate(patientInput)
                  }
                }}
                className="text-sm resize-none"
              />
              <Button
                data-testid="button-send-patient"
                size="sm"
                variant="outline"
                className="self-end"
                onClick={() => { if (patientInput.trim()) sendPatientMsg.mutate(patientInput) }}
              >
                ↵
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {COMPLAINT_CHIPS.map((c) => (
                <button
                  key={c}
                  data-testid={`chip-complaint-${c.replace(/\s+/g, "-")}`}
                  onClick={() => sendPatientMsg.mutate(c)}
                  className="text-[11px] px-2 py-0.5 rounded-full border bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Canned messages */}
          <div className="px-3 pt-2 pb-1 shrink-0">
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
              Canned messages — click to load into draft
            </p>
            <div className="flex flex-wrap gap-1">
              {cannedMessages.map((cm) => (
                <button
                  key={cm.id}
                  data-testid={`canned-${cm.id}`}
                  title={cm.text}
                  onClick={() => insertIntoDraft(cm.text)}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                    CANNED_CATEGORY_COLORS[cm.category] ?? "bg-muted"
                  )}
                >
                  {cm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Draft reply area */}
          <div className="px-3 pt-1 pb-3 border-t shrink-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Doctor reply draft
              </p>
              <span className="text-[10px] text-blue-500">AI-suggested · editable before send</span>
            </div>
            <Textarea
              ref={draftRef}
              data-testid="textarea-draft-reply"
              rows={3}
              placeholder="AI will suggest a reply here after analysis…"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDraftTouched(true) }}
              className="text-sm resize-none border-blue-200 focus:border-blue-400"
            />
            <div className="flex gap-2 mt-2">
              <Button
                data-testid="button-analyze"
                size="sm"
                variant="outline"
                onClick={() => analyze()}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? "Analyzing…" : "⟳ Analyze  Ctrl+↵"}
              </Button>
              <Button
                data-testid="button-send-reply"
                size="sm"
                onClick={() => { if (draft.trim()) sendDoctorReply.mutate(draft) }}
                disabled={!draft.trim() || sendDoctorReply.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
              >
                {sendDoctorReply.isPending ? "Sending…" : "Send Reply  Ctrl+R"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Clinical reasoning ── */}
        <ScrollArea className="w-[30%] min-w-0 px-3 py-3">
          <div className="space-y-4">

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Differential
              </h3>
              {result?.differential?.length ? (
                <div className="space-y-2">
                  {result.differential.map((d, i) => (
                    <div key={d.diagnosis}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-sm font-medium flex-1">{d.diagnosis}</span>
                        {i === 0 && <Badge className="text-[10px] bg-blue-600 text-white">Top</Badge>}
                      </div>
                      <ConfidenceBar score={d.score} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Waiting for analysis…</p>
              )}
            </section>

            {result?.triage && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Triage
                </h3>
                <Badge className={cn("text-sm px-3 py-1", triageBadgeClass(result.triage.level))}>
                  {result.triage.level}
                </Badge>
                {result.triage.reason && (
                  <p className="text-xs text-muted-foreground mt-1">{result.triage.reason}</p>
                )}
              </section>
            )}

            {result?.nextQuestions?.length ? (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Ask patient
                </h3>
                <div className="space-y-1">
                  {result.nextQuestions.map((q, i) => (
                    <button
                      key={q}
                      data-testid={`question-${i}`}
                      onClick={() => insertIntoDraft(q)}
                      className={cn(
                        "w-full text-left text-xs px-2 py-1.5 rounded border transition-colors",
                        selectedQ === i
                          ? "bg-blue-50 border-blue-300 text-blue-800"
                          : "bg-card hover:bg-muted border-border"
                      )}
                    >
                      <span className="font-mono text-[9px] text-muted-foreground mr-1.5">
                        Alt+{i + 1}
                      </span>
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {result?.resources?.recommendedActions?.length ? (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Actions
                </h3>
                <div className="space-y-1.5">
                  {result.resources.recommendedActions.map((a) => {
                    const pri = (a.priority ?? "routine").toLowerCase()
                    const bc =
                      pri === "stat"
                        ? "bg-red-500 text-white"
                        : pri === "urgent"
                        ? "bg-orange-400 text-white"
                        : "bg-gray-200 text-gray-700"
                    return (
                      <div key={a.diagnosis} className="flex items-start gap-1.5">
                        <Badge className={cn("text-[10px] mt-0.5 shrink-0", bc)}>
                          {a.priority ?? "routine"}
                        </Badge>
                        <span className="text-xs">{a.diagnosis}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {result?.contradictions?.length ? (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
                  ⚠ Contradictions
                </h3>
                <div className="space-y-1.5">
                  {result.contradictions.map((c) => (
                    <div
                      key={c.diagnosis}
                      className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
                    >
                      <span className="font-medium">{c.diagnosis}:</span> {c.conflict}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </ScrollArea>

        {/* ── RIGHT: Chart note + discharge ── */}
        <div className="flex flex-col w-[32%] min-w-0 overflow-hidden">
          <ScrollArea className="flex-1 px-3 py-3">
            <div className="space-y-4">

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Chart Note
                  </h3>
                  <Button
                    data-testid="button-copy-note"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() => copyText("note", note)}
                  >
                    {lastCopied === "note" ? "✓ Copied" : "Copy"}
                    <span className="ml-1 text-muted-foreground text-[10px]">Ctrl+N</span>
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap font-mono leading-relaxed border">
                  {note || "Waiting for analysis…"}
                </pre>
              </section>

              <Separator />

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Discharge Message
                  </h3>
                  <Button
                    data-testid="button-copy-discharge"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() => copyText("discharge", discharge)}
                  >
                    {lastCopied === "discharge" ? "✓ Copied" : "Copy"}
                    <span className="ml-1 text-muted-foreground text-[10px]">Ctrl+D</span>
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap font-mono leading-relaxed border">
                  {discharge || "Waiting for analysis…"}
                </pre>
                <Button
                  data-testid="button-load-discharge"
                  size="sm"
                  className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => insertIntoDraft(discharge)}
                >
                  Load Discharge → Draft
                </Button>
              </section>

            </div>
          </ScrollArea>
        </div>

      </div>
    </div>
  )
}
