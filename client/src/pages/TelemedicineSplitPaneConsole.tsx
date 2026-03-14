import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  role: "patient" | "doctor" | "assistant" | "system"
  text: string
  timestamp: string
  channel?: string
}

type ConvMeta = {
  caseId: string
  channel: "telegram" | "whatsapp" | "web"
  externalId: string
  updatedAt: string
  sessionState?: SessionState
}

type SessionState = "active" | "waiting_for_patient" | "doctor_reviewing" | "discharged"

type ConversationData = {
  ok: boolean
  caseId: string
  messages: ChatMessage[]
  meta: ConvMeta | null
  lastResult: AssistantResult | null
}

type AssistantResult = {
  complaint?: string
  triage?: { level: string; reason?: string }
  differential?: { diagnosis: string; score: number }[]
  nextQuestions?: string[]
  resources?: { recommendedActions?: { diagnosis: string; priority?: string }[] }
  contradictions?: { diagnosis: string; conflict: string }[]
}

type ConversationSummary = {
  caseId: string
  channel: string
  externalId: string
  updatedAt: string
  sessionState?: SessionState
}

type CannedCategory = {
  category: string
  messages: { id: string; label: string; text: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triageColor(level?: string) {
  const l = (level ?? "").toLowerCase()
  if (l.includes("stat") || l.includes("critical") || l.includes("emergent")) return "bg-red-600 text-white"
  if (l.includes("urgent")) return "bg-orange-500 text-white"
  if (l.includes("semi")) return "bg-amber-400 text-white"
  return "bg-green-500 text-white"
}

function channelIcon(ch?: string) {
  if (ch === "telegram") return "✈️"
  if (ch === "whatsapp") return "💬"
  return "🌐"
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function sessionStateBadge(state?: SessionState) {
  if (!state) return { label: "Active", cls: "bg-green-100 text-green-700" }
  const map: Record<SessionState, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-green-100 text-green-700" },
    waiting_for_patient: { label: "Waiting Patient", cls: "bg-amber-100 text-amber-700" },
    doctor_reviewing: { label: "Dr Reviewing", cls: "bg-blue-100 text-blue-700" },
    discharged: { label: "Discharged", cls: "bg-gray-100 text-gray-500" },
  }
  return map[state]
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 60 ? "bg-blue-500" : pct >= 35 ? "bg-amber-400" : "bg-gray-300"
  return (
    <div className="flex items-center gap-2 text-xs mt-0.5">
      <div className="flex-1 bg-gray-100 rounded h-1.5">
        <div className={cn("h-1.5 rounded transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right text-muted-foreground">{pct}%</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TelemedicineSplitPaneConsole() {
  const [caseId, setCaseId] = useState("tg_demo_1")
  const [caseIdInput, setCaseIdInput] = useState("tg_demo_1")
  const [replyText, setReplyText] = useState("")
  const [sendToPatient, setSendToPatient] = useState(true)
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [status, setStatus] = useState<string>("")
  const [showCanned, setShowCanned] = useState(false)
  const [cannedFilter, setCannedFilter] = useState("")
  const [copied, setCopied] = useState<"note" | "discharge" | null>(null)

  const qc = useQueryClient()
  const convBottomRef = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: convData, isLoading: convLoading } = useQuery<ConversationData>({
    queryKey: ["/api/conversations", caseId],
    queryFn: () => fetch(`/api/conversations/${encodeURIComponent(caseId)}`).then((r) => r.json()),
    refetchInterval: 3000,
    enabled: !!caseId,
  })

  const { data: listData } = useQuery<{ ok: boolean; conversations: ConversationSummary[] }>({
    queryKey: ["/api/conversations"],
    queryFn: () => fetch("/api/conversations").then((r) => r.json()),
    refetchInterval: 5000,
  })

  const { data: cannedData } = useQuery<{ ok: boolean; categories: CannedCategory[] }>({
    queryKey: ["/api/telemed/canned-messages"],
    queryFn: () => fetch("/api/telemed/canned-messages").then((r) => r.json()),
    staleTime: Infinity,
  })

  const messages = convData?.messages ?? []
  const meta = convData?.meta
  const sessionState = meta?.sessionState

  const stateBadge = sessionStateBadge(sessionState)

  useEffect(() => {
    if (convData?.lastResult) setResult(convData.lastResult)
  }, [convData?.lastResult])

  useEffect(() => {
    convBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    if (!replyText && result?.nextQuestions?.[0]) {
      setReplyText(result.nextQuestions[0])
    }
  }, [result?.nextQuestions?.[0]])

  // ── Chart note + discharge instructions ──────────────────────────────────────

  const chartNote = useMemo(() => {
    const history = messages.filter((m) => m.role === "patient").map((m) => m.text).join(" ")
    return `Chief Complaint:\n${result?.complaint ?? ""}\n\nHistory:\n${history}\n\nAssessment:\n${
      result?.differential?.[0]?.diagnosis ?? ""
    }\n\nPlan:\n${
      result?.resources?.recommendedActions?.map((a) => a.diagnosis).join("\n") ?? ""
    }\n\nDisposition:\n${result?.triage?.level ?? ""}`
  }, [messages, result])

  const dischargeInstructions = useMemo(() => {
    const dx = result?.differential?.[0]?.diagnosis ?? "your condition"
    const actions = result?.resources?.recommendedActions?.map((a) => `• ${a.diagnosis}`).join("\n") ?? ""
    return `Discharge Instructions\n──────────────────────\nDiagnosis: ${dx}\n\nFollow-up:\n${actions || "• Follow up with your primary care provider"}\n\nReturn precautions:\n• Return to ER if symptoms worsen\n• Fever > 103°F / 39.4°C\n• Difficulty breathing\n• Severe chest pain`
  }, [result])

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const sendDoctor = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/conversations/${encodeURIComponent(caseId)}/doctor-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, send: sendToPatient }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setReplyText("")
      if (data.result) setResult(data.result)
      setStatus(sendToPatient ? "Sent to patient ✓" : "Saved (not sent) ✓")
      qc.invalidateQueries({ queryKey: ["/api/conversations", caseId] })
      qc.invalidateQueries({ queryKey: ["/api/conversations"] })
    },
    onError: (e: any) => setStatus(`Error: ${e.message}`),
  })

  const simulatePatient = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/conversations/${encodeURIComponent(caseId)}/patient-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, channel: "web" }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.result) setResult(data.result)
      qc.invalidateQueries({ queryKey: ["/api/conversations", caseId] })
    },
  })

  const reAnalyze = useMutation({
    mutationFn: () =>
      fetch(`/api/conversations/${encodeURIComponent(caseId)}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.result) setResult(data.result)
      setStatus("Analysis updated ✓")
    },
  })

  const updateState = useMutation({
    mutationFn: (state: SessionState) =>
      fetch(`/api/conversations/${encodeURIComponent(caseId)}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations", caseId] })
      qc.invalidateQueries({ queryKey: ["/api/conversations"] })
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function loadCase(id: string) {
    setCaseId(id)
    setCaseIdInput(id)
    setResult(null)
    setReplyText("")
    setStatus("")
  }

  function insertCanned(text: string) {
    setReplyText(text)
    setShowCanned(false)
    replyRef.current?.focus()
  }

  const copyNote = useCallback(() => {
    navigator.clipboard.writeText(chartNote).then(() => {
      setCopied("note")
      setTimeout(() => setCopied(null), 1500)
    })
  }, [chartNote])

  const copyDischarge = useCallback(() => {
    navigator.clipboard.writeText(dischargeInstructions).then(() => {
      setCopied("discharge")
      setTimeout(() => setCopied(null), 1500)
    })
  }, [dischargeInstructions])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────────
  // Ctrl+Enter → send reply
  // Ctrl+N     → copy chart note
  // Ctrl+D     → copy discharge instructions
  // Ctrl+K     → open/close canned messages panel
  // Escape     → close canned messages panel

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { setShowCanned(false); return }
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === "k" || e.key === "K") { e.preventDefault(); setShowCanned((s) => !s); return }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); copyNote(); return }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); copyDischarge(); return }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [copyNote, copyDischarge])

  // ── Canned messages filter ─────────────────────────────────────────────────────

  const filteredCanned = useMemo(() => {
    if (!cannedData?.categories) return []
    if (!cannedFilter.trim()) return cannedData.categories
    const q = cannedFilter.toLowerCase()
    return cannedData.categories
      .map((cat) => ({
        ...cat,
        messages: cat.messages.filter(
          (m) => m.label.toLowerCase().includes(q) || m.text.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.messages.length > 0)
  }, [cannedData, cannedFilter])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Case list sidebar ── */}
      <div className="w-52 border-r flex flex-col shrink-0">
        <div className="px-3 py-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Active Cases
          </p>
          <div className="flex gap-1">
            <Input
              data-testid="input-case-id"
              value={caseIdInput}
              onChange={(e) => setCaseIdInput(e.target.value)}
              className="h-7 text-xs font-mono"
              placeholder="case id…"
            />
            <Button
              data-testid="button-load-case"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs shrink-0"
              onClick={() => loadCase(caseIdInput.trim() || "tg_demo_1")}
            >
              Load
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {(listData?.conversations ?? []).map((c) => {
            const sb = sessionStateBadge(c.sessionState)
            return (
              <button
                key={c.caseId}
                data-testid={`case-item-${c.caseId}`}
                onClick={() => loadCase(c.caseId)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b hover:bg-muted transition-colors",
                  c.caseId === caseId && "bg-blue-50 border-l-2 border-l-blue-500"
                )}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[11px]">{channelIcon(c.channel)}</span>
                  <span className="font-mono text-[10px] truncate text-muted-foreground">{c.externalId}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={cn("text-[9px] rounded-full px-1.5 py-0.5 font-medium", sb.cls)}>
                    {sb.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(c.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </button>
            )
          })}
          {(listData?.conversations ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-6 px-2">
              No conversations yet — messages arrive here from Telegram / WhatsApp
            </p>
          )}
        </ScrollArea>
      </div>

      {/* ── Split pane body ── */}
      <div className="flex flex-1 overflow-hidden divide-x">

        {/* ── LEFT: Chat thread ── */}
        <div className="flex flex-col w-[50%] min-w-0">

          {/* Header with session state badge + controls */}
          <div className="px-4 py-2 border-b bg-card flex items-center justify-between shrink-0 gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {meta && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {channelIcon(meta.channel)} {meta.channel} · {meta.externalId}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] font-mono">{caseId}</Badge>
              {result?.triage?.level && (
                <Badge className={cn("text-xs", triageColor(result.triage.level))}>
                  {result.triage.level}
                </Badge>
              )}
              {/* D: Session state badge + state picker */}
              <span
                data-testid="badge-session-state"
                className={cn("text-[10px] rounded-full px-2 py-0.5 font-semibold", stateBadge.cls)}
              >
                {stateBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* Session state quick-actions */}
              <select
                data-testid="select-session-state"
                className="text-[10px] border rounded px-1.5 py-0.5 bg-background cursor-pointer"
                value={sessionState ?? "active"}
                onChange={(e) => updateState.mutate(e.target.value as SessionState)}
              >
                <option value="active">Active</option>
                <option value="waiting_for_patient">Waiting Patient</option>
                <option value="doctor_reviewing">Dr Reviewing</option>
                <option value="discharged">Discharged</option>
              </select>
              <Button
                data-testid="button-reanalyze"
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => reAnalyze.mutate()}
                disabled={reAnalyze.isPending}
              >
                {reAnalyze.isPending ? "…" : "⟳"}
              </Button>
            </div>
          </div>

          {/* Chat bubbles */}
          <ScrollArea className="flex-1 px-4 py-3">
            {convLoading ? (
              <p className="text-xs text-center text-muted-foreground mt-8">Loading conversation…</p>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                <span className="text-3xl">💬</span>
                <span className="text-sm">No messages yet</span>
                <span className="text-xs">Messages from Telegram/WhatsApp appear here automatically</span>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  className={cn(
                    "mb-3 flex",
                    msg.role === "doctor" ? "justify-end"
                    : msg.role === "system" || msg.role === "assistant" ? "justify-center"
                    : "justify-start"
                  )}
                >
                  {msg.role === "system" || msg.role === "assistant" ? (
                    <div className="max-w-[90%] text-[10px] text-muted-foreground bg-muted border rounded px-2 py-1 text-center whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm",
                        msg.role === "doctor"
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-card border rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
                      <p className={cn("text-[10px] mt-1", msg.role === "doctor" ? "text-blue-200 text-right" : "text-muted-foreground")}>
                        {formatTime(msg.timestamp)} · {msg.role}
                        {msg.channel && ` · ${channelIcon(msg.channel)}`}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={convBottomRef} />
          </ScrollArea>

          {/* C: Canned messages panel */}
          {showCanned && (
            <div className="border-t bg-muted/40 max-h-52 flex flex-col">
              <div className="px-3 py-2 border-b flex items-center gap-2">
                <Input
                  data-testid="input-canned-filter"
                  autoFocus
                  placeholder="Search canned messages…"
                  className="h-7 text-xs flex-1"
                  value={cannedFilter}
                  onChange={(e) => setCannedFilter(e.target.value)}
                />
                <button
                  data-testid="button-close-canned"
                  onClick={() => setShowCanned(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <ScrollArea className="flex-1">
                <div className="px-3 pb-2">
                  {filteredCanned.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No matching canned messages</p>
                  )}
                  {filteredCanned.map((cat) => (
                    <div key={cat.category} className="mt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        {cat.category}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {cat.messages.map((m) => (
                          <button
                            key={m.id}
                            data-testid={`canned-btn-${m.id}`}
                            onClick={() => insertCanned(m.text)}
                            className="text-[11px] px-2 py-1 rounded border bg-background hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Reply area */}
          <div className="px-4 py-3 border-t shrink-0">
            <Textarea
              data-testid="textarea-doctor-reply"
              ref={replyRef}
              rows={3}
              placeholder="Type reply… (Ctrl+K for canned messages)"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  if (replyText.trim()) sendDoctor.mutate(replyText)
                }
              }}
              className="text-sm resize-none mb-2"
            />

            {/* Suggested question chips */}
            {result?.nextQuestions?.length ? (
              <div className="flex flex-wrap gap-1 mb-2">
                {result.nextQuestions.slice(0, 4).map((q, i) => (
                  <button
                    key={i}
                    data-testid={`question-chip-${i}`}
                    onClick={() => setReplyText(q)}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    {q.slice(0, 40)}{q.length > 40 ? "…" : ""}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendToPatient}
                    onChange={(e) => setSendToPatient(e.target.checked)}
                    className="rounded"
                  />
                  Deliver via {meta?.channel ?? "channel"}
                </label>
                <Button
                  data-testid="button-toggle-canned"
                  size="sm"
                  variant={showCanned ? "secondary" : "outline"}
                  className="h-6 text-xs px-2"
                  onClick={() => setShowCanned((s) => !s)}
                >
                  📋 Canned
                  <span className="ml-1 text-[9px] text-muted-foreground">Ctrl+K</span>
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                {status && <span className="text-[11px] text-green-600">{status}</span>}
                <Button
                  data-testid="button-send-doctor"
                  size="sm"
                  onClick={() => { if (replyText.trim()) sendDoctor.mutate(replyText) }}
                  disabled={!replyText.trim() || sendDoctor.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {sendDoctor.isPending
                    ? "Sending…"
                    : sendToPatient
                    ? "Send  Ctrl+↵"
                    : "Save  Ctrl+↵"}
                </Button>
              </div>
            </div>
          </div>

          {/* Simulate patient (testing) */}
          <details className="px-4 pb-2 border-t">
            <summary className="text-[10px] text-muted-foreground cursor-pointer py-1">
              Simulate patient message (testing)
            </summary>
            <div className="flex gap-1.5 mt-1">
              <Input
                data-testid="input-simulate-patient"
                id="sim-input"
                className="h-7 text-xs"
                placeholder="Type patient message…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) { simulatePatient.mutate(v); (e.target as HTMLInputElement).value = "" }
                  }
                }}
              />
              <Button
                data-testid="button-simulate-patient"
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => {
                  const el = document.getElementById("sim-input") as HTMLInputElement | null
                  if (el?.value.trim()) { simulatePatient.mutate(el.value); el.value = "" }
                }}
              >
                Send
              </Button>
            </div>
          </details>
        </div>

        {/* ── RIGHT: Clinical reasoning + chart note ── */}
        <div className="flex flex-col w-[50%] min-w-0 overflow-hidden">
          <div className="px-4 py-2 border-b bg-card shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Clinical Reasoning
              </p>
              <div className="flex gap-1.5">
                <Button
                  data-testid="button-copy-note"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={copyNote}
                >
                  {copied === "note" ? "Copied! ✓" : "Copy Note  Ctrl+N"}
                </Button>
                <Button
                  data-testid="button-copy-discharge"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={copyDischarge}
                >
                  {copied === "discharge" ? "Copied! ✓" : "Discharge  Ctrl+D"}
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 py-4">
            <div className="space-y-5">

              {/* Differential */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Differential</h3>
                {result?.differential?.length ? (
                  <div className="space-y-2">
                    {result.differential.map((d, i) => (
                      <div key={d.diagnosis}>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium flex-1">{d.diagnosis}</span>
                          {i === 0 && <Badge className="bg-blue-600 text-white text-[10px]">Top</Badge>}
                        </div>
                        <ConfidenceBar score={d.score} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Waiting for messages…</p>
                )}
              </section>

              {/* Triage */}
              {result?.triage && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Triage</h3>
                  <Badge className={cn("text-sm px-3 py-1", triageColor(result.triage.level))}>
                    {result.triage.level}
                  </Badge>
                  {result.triage.reason && (
                    <p className="text-xs text-muted-foreground mt-1">{result.triage.reason}</p>
                  )}
                </section>
              )}

              {/* Recommended actions */}
              {result?.resources?.recommendedActions?.length ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Actions</h3>
                  <div className="space-y-1.5">
                    {result.resources.recommendedActions.map((a) => {
                      const pri = (a.priority ?? "routine").toLowerCase()
                      const bc =
                        pri === "stat" ? "bg-red-500 text-white" :
                        pri === "urgent" ? "bg-orange-400 text-white" :
                        "bg-gray-200 text-gray-700"
                      return (
                        <div key={a.diagnosis} className="flex items-start gap-1.5">
                          <Badge className={cn("text-[10px] mt-0.5 shrink-0", bc)}>{a.priority ?? "routine"}</Badge>
                          <span className="text-xs">{a.diagnosis}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {/* Contradictions */}
              {result?.contradictions?.length ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">⚠ Contradictions</h3>
                  {result.contradictions.map((c) => (
                    <div key={c.diagnosis} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-1.5">
                      <span className="font-medium">{c.diagnosis}:</span> {c.conflict}
                    </div>
                  ))}
                </section>
              ) : null}

              <Separator />

              {/* Chart note */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Chart Note</h3>
                </div>
                <pre className="text-xs bg-muted border rounded p-3 whitespace-pre-wrap font-mono leading-relaxed">
                  {chartNote || "Waiting for messages…"}
                </pre>
              </section>

              <Separator />

              {/* Discharge instructions */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discharge Instructions</h3>
                </div>
                <pre className="text-xs bg-muted border rounded p-3 whitespace-pre-wrap font-mono leading-relaxed">
                  {dischargeInstructions}
                </pre>
              </section>

            </div>
          </ScrollArea>
        </div>

      </div>

      {/* Keyboard shortcuts tooltip */}
      <div className="fixed bottom-3 right-4 text-[10px] text-muted-foreground bg-muted/80 border rounded px-2 py-1 shadow-sm pointer-events-none">
        Ctrl+↵ send · Ctrl+K canned · Ctrl+N copy note · Ctrl+D discharge
      </div>

    </div>
  )
}
