import { useEffect, useMemo, useRef, useState } from "react"
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
}

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

  const qc = useQueryClient()
  const convBottomRef = useRef<HTMLDivElement>(null)

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

  const messages = convData?.messages ?? []
  const meta = convData?.meta

  // Sync AI result from server
  useEffect(() => {
    if (convData?.lastResult) setResult(convData.lastResult)
  }, [convData?.lastResult])

  // Auto-scroll on new messages
  useEffect(() => {
    convBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Pre-fill reply with a suggested question when result arrives
  useEffect(() => {
    if (!replyText && result?.nextQuestions?.[0]) {
      setReplyText(result.nextQuestions[0])
    }
  }, [result?.nextQuestions?.[0]])

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

  // ── Chart note ────────────────────────────────────────────────────────────────

  const chartNote = useMemo(() => {
    const history = messages.filter((m) => m.role === "patient").map((m) => m.text).join(" ")
    return `Chief Complaint:\n${result?.complaint ?? ""}\n\nHistory:\n${history}\n\nAssessment:\n${
      result?.differential?.[0]?.diagnosis ?? ""
    }\n\nPlan:\n${
      result?.resources?.recommendedActions?.map((a) => a.diagnosis).join("\n") ?? ""
    }\n\nDisposition:\n${result?.triage?.level ?? ""}`
  }, [messages, result])

  function loadCase(id: string) {
    setCaseId(id)
    setCaseIdInput(id)
    setResult(null)
    setReplyText("")
    setStatus("")
  }

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
          {(listData?.conversations ?? []).map((c) => (
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
                <span className="font-mono text-[10px] truncate text-muted-foreground">
                  {c.externalId}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {new Date(c.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </button>
          ))}
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

          {/* Header */}
          <div className="px-4 py-2 border-b bg-card flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
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
            </div>
            <Button
              data-testid="button-reanalyze"
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => reAnalyze.mutate()}
              disabled={reAnalyze.isPending}
            >
              {reAnalyze.isPending ? "Analyzing…" : "⟳ Re-analyze"}
            </Button>
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
                    msg.role === "doctor"
                      ? "justify-end"
                      : msg.role === "system" || msg.role === "assistant"
                      ? "justify-center"
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
                      <p
                        className={cn(
                          "text-[10px] mt-1",
                          msg.role === "doctor" ? "text-blue-200 text-right" : "text-muted-foreground"
                        )}
                      >
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

          {/* Reply area */}
          <div className="px-4 py-3 border-t shrink-0">
            <Textarea
              data-testid="textarea-doctor-reply"
              rows={3}
              placeholder="Type reply… (pre-filled from AI suggestion)"
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

            {/* Suggested questions as quick-insert chips */}
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendToPatient}
                  onChange={(e) => setSendToPatient(e.target.checked)}
                  className="rounded"
                />
                Deliver to patient via {meta?.channel ?? "channel"}
              </label>
              <div className="flex gap-2 items-center">
                {status && (
                  <span className="text-[11px] text-green-600">{status}</span>
                )}
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
                    ? "Send to Patient  Ctrl+↵"
                    : "Save Note  Ctrl+↵"}
                </Button>
              </div>
            </div>
          </div>

          {/* Simulate patient (for testing) */}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Clinical Reasoning — auto-updates on every message
            </p>
          </div>
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="space-y-5">

              {/* Differential */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Differential
                </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Triage
                  </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Actions
                  </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
                    ⚠ Contradictions
                  </h3>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Live Chart Note
                  </h3>
                  <Button
                    data-testid="button-copy-note"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() => navigator.clipboard.writeText(chartNote)}
                  >
                    Copy
                  </Button>
                </div>
                <pre className="text-xs bg-muted border rounded p-3 whitespace-pre-wrap font-mono leading-relaxed">
                  {chartNote || "Waiting for messages…"}
                </pre>
              </section>

            </div>
          </ScrollArea>
        </div>

      </div>
    </div>
  )
}
