import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"

type DifferentialRow = { diagnosis: string; confidence: number; urgency: string }
type AssistantResult = {
  complaint?: string | null
  triage?: { level: string; urgencyScore: number; reason?: string }
  differential?: DifferentialRow[]
  nextQuestions?: string[]
  resources?: { labs?: string[]; imaging?: string[]; referrals?: string[]; recommendedActions?: any[] }
  contradictions?: { diagnosis: string; conflict: string }[]
  safetyAlerts?: { message: string; severity: string }[]
}

const COMPLAINT_CHIPS = [
  "cough", "sore throat", "UTI symptoms", "rash",
  "ear pain", "sinus pressure", "fever", "chest pain",
  "abdominal pain", "headache", "shortness of breath",
]

const TRIAGE_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  urgent: "bg-orange-100 text-orange-800 border-orange-300",
  "semi-urgent": "bg-amber-100 text-amber-800 border-amber-300",
  routine: "bg-green-100 text-green-800 border-green-300",
}

const TRIAGE_ICONS: Record<string, string> = {
  critical: "🔴", urgent: "🟠", "semi-urgent": "🟡", routine: "🟢",
}

const URGENCY_COLORS: Record<string, string> = {
  emergent: "text-red-700", urgent: "text-orange-600", routine: "text-gray-600",
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-gray-400"
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  )
}

export default function RapidTelemedicineConsole() {
  const { toast } = useToast()
  const [caseId] = useState(`visit_${Date.now()}`)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [status, setStatus] = useState("Ready")
  const [selectedQ, setSelectedQ] = useState(0)
  const [lastCopied, setLastCopied] = useState<"" | "note" | "discharge">("")
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function analyze(text?: string) {
    const trimmed = (text ?? message).trim()
    if (!trimmed) return
    try {
      setIsAnalyzing(true)
      setStatus("Analyzing…")
      const res = await fetch("/api/telemed/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, message: trimmed }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult(data.result)
        setStatus("Updated")
        setSelectedQ(0)
      } else {
        setStatus("Error — see console")
      }
    } catch {
      setStatus("Network error")
    } finally {
      setIsAnalyzing(false)
    }
  }

  function scheduleAnalyze(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => analyze(val), 480)
  }

  function insertText(snippet: string) {
    const next = `${message}${message.trim() ? " " : ""}${snippet}`.trim()
    setMessage(next)
    textAreaRef.current?.focus()
    scheduleAnalyze(next)
  }

  async function copy(kind: "note" | "discharge", text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setLastCopied(kind)
      setStatus(`Copied ${kind}`)
      toast({ title: `${kind === "note" ? "Chart note" : "Discharge message"} copied` })
      setTimeout(() => setLastCopied(""), 1500)
    } catch {
      setStatus("Copy failed")
    }
  }

  const note = useMemo(() => {
    if (!result) return ""
    const dx = result.differential?.map((d, i) => `${i + 1}. ${d.diagnosis} (${Math.round(d.confidence * 100)}%)`).join("\n") ?? ""
    const plan = result.resources?.recommendedActions?.map((a: any) => `• ${a.diagnosis}`).join("\n") ?? "• Supportive care"
    const alerts = result.safetyAlerts?.filter(a => a.severity === "critical").map(a => `⚠ ${a.message}`).join("\n") || "None"
    return `CHIEF COMPLAINT:\n${result.complaint ?? ""}\n\nHISTORY:\n${message}\n\nASSESSMENT:\n${dx}\n\nPLAN:\n${plan}\n\nDISPOSITION:\n${result.triage?.level?.toUpperCase() ?? ""}\n\nSAFETY ALERTS:\n${alerts}`
  }, [message, result])

  const discharge = useMemo(() => {
    if (!result) return ""
    const topDx = result.differential?.[0]?.diagnosis ?? "your reported symptoms"
    const plan = result.resources?.recommendedActions?.map((a: any) => `• ${a.diagnosis}`).join("\n") ?? "• Rest and supportive care"
    return `Hi,\n\nThank you for your visit. Based on our assessment, your symptoms are most consistent with:\n\n  ${topDx}\n\nRECOMMENDED CARE:\n${plan}\n\nRETURN IMMEDIATELY IF:\n• Severe shortness of breath\n• Severe chest pain or pressure\n• High fever not responding to medication\n• Symptoms rapidly worsening\n\nFollow up as advised.\n\nYour Care Team`
  }, [result])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === "Enter") { e.preventDefault(); analyze(); return }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); copy("note", note); return }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); copy("discharge", discharge); return }
      if (mod && e.key.toLowerCase() === "l") { e.preventDefault(); textAreaRef.current?.focus(); return }
      if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); setSelectedQ(i => Math.min(i + 1, (result?.nextQuestions?.length ?? 1) - 1)); return }
      if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); setSelectedQ(i => Math.max(i - 1, 0)); return }
      if (e.altKey && e.key === "Enter") { e.preventDefault(); const q = result?.nextQuestions?.[selectedQ]; if (q) insertText(q); return }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const q = result?.nextQuestions?.[Number(e.key) - 1]
        if (q) { e.preventDefault(); insertText(q) }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [result, selectedQ, note, discharge, message])

  const triageLevel = result?.triage?.level ?? ""
  const criticalAlerts = result?.safetyAlerts?.filter(a => a.severity === "critical") ?? []

  return (
    <div className="min-h-screen bg-gray-50 p-3">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-base font-bold text-gray-900">Rapid Telemedicine Console</h1>
            <div className="text-[10px] text-muted-foreground">
              Ctrl+Enter analyze · Ctrl+N copy note · Ctrl+D copy discharge · Alt+1–9 add question
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isAnalyzing ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
              {isAnalyzing ? "⟳ Analyzing…" : status}
            </span>
            <span className="text-[9px] text-muted-foreground font-mono">{caseId}</span>
          </div>
        </div>

        {/* Critical alerts bar */}
        {criticalAlerts.length > 0 && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {criticalAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-800 text-xs px-3 py-1.5 rounded-full font-semibold">
                ⛔ {a.message}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[2fr_1.2fr_1.3fr] gap-3">

          {/* ── LEFT PANEL: Input + Questions ── */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-3 space-y-3">
                <Textarea
                  ref={textAreaRef}
                  className="min-h-[140px] text-sm resize-none font-mono"
                  value={message}
                  onChange={e => { setMessage(e.target.value); scheduleAnalyze(e.target.value) }}
                  placeholder="Paste the patient's Telegram / WhatsApp message here…"
                  data-testid="textarea-patient-message"
                />

                {/* Complaint chips */}
                <div className="flex flex-wrap gap-1.5">
                  {COMPLAINT_CHIPS.map(chip => (
                    <button
                      key={chip}
                      onClick={() => insertText(chip)}
                      className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700 transition-colors"
                      data-testid={`chip-${chip.replace(/\s/g, "-")}`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700"
                    onClick={() => analyze()}
                    disabled={isAnalyzing || !message.trim()}
                    data-testid="btn-analyze"
                  >
                    {isAnalyzing ? "Analyzing…" : "⚡ Analyze Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { setMessage(""); setResult(null); setStatus("Cleared"); textAreaRef.current?.focus() }}
                    data-testid="btn-clear"
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Suggested Questions */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Next Best Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1.5">
                {!result?.nextQuestions?.length && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Analyze a message to see suggested questions.
                  </p>
                )}
                {result?.nextQuestions?.map((q, i) => (
                  <button
                    key={q}
                    onClick={() => insertText(q)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      i === selectedQ
                        ? "border-blue-400 bg-blue-50 text-blue-900"
                        : "border-gray-200 bg-gray-50 hover:bg-white text-gray-700"
                    }`}
                    data-testid={`question-${i}`}
                  >
                    <span className="font-mono text-[9px] text-muted-foreground mr-2">Alt+{i + 1}</span>
                    {q}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── MIDDLE PANEL: Reasoning ── */}
          <div className="space-y-3">
            {/* Triage */}
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Triage</div>
                {triageLevel ? (
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold ${TRIAGE_COLORS[triageLevel] ?? TRIAGE_COLORS.routine}`}>
                    {TRIAGE_ICONS[triageLevel] ?? "⚪"} {triageLevel.replace(/-/g, " ").toUpperCase()}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {result?.triage?.reason && (
                  <p className="text-[10px] text-muted-foreground mt-1">{result.triage.reason}</p>
                )}
              </CardContent>
            </Card>

            {/* Differential */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Differential
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                {!result?.differential?.length && (
                  <p className="text-xs text-muted-foreground text-center py-2">—</p>
                )}
                {result?.differential?.map((d, i) => (
                  <div key={d.diagnosis} className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100" data-testid={`dx-row-${i}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-800">{d.diagnosis}</span>
                      <span className={`text-[9px] font-medium ${URGENCY_COLORS[d.urgency] ?? "text-gray-500"}`}>
                        {d.urgency}
                      </span>
                    </div>
                    <ConfidenceBar value={d.confidence} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Contradictions */}
            {(result?.contradictions?.length ?? 0) > 0 && (
              <Card className="border-amber-200">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    ⚡ Contradictions / Gaps
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1.5">
                  {result!.contradictions!.map((c, i) => (
                    <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5" data-testid={`contradiction-${i}`}>
                      <span className="font-semibold text-amber-800">{c.diagnosis}</span>
                      <p className="text-amber-700 mt-0.5">{c.conflict}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── RIGHT PANEL: Actions + Note + Discharge ── */}
          <div className="space-y-3">
            {/* Recommended Actions */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  🧪 Recommended Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {!result?.resources?.recommendedActions?.length && (
                  <p className="text-xs text-muted-foreground text-center py-2">—</p>
                )}
                {result?.resources?.recommendedActions?.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-gray-50 border border-gray-100" data-testid={`action-${i}`}>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 flex-shrink-0 ${
                      a.priority === "stat" ? "bg-red-50 text-red-700 border-red-200"
                      : a.priority === "urgent" ? "bg-orange-50 text-orange-700 border-orange-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {a.priority}
                    </Badge>
                    <span className="text-gray-800">{a.diagnosis}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Chart Note */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Chart Note
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-6 text-[10px] px-2 ${lastCopied === "note" ? "bg-green-50 border-green-300 text-green-700" : ""}`}
                    onClick={() => copy("note", note)}
                    disabled={!note}
                    data-testid="btn-copy-note"
                  >
                    {lastCopied === "note" ? "✓ Copied" : "Copy"} <span className="ml-1 text-muted-foreground">Ctrl+N</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[140px]">
                  <pre className="text-[10px] font-mono text-gray-700 whitespace-pre-wrap px-3 pb-3 leading-relaxed">
                    {note || "Analyze a message to generate a chart note."}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Discharge */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Discharge Message
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-6 text-[10px] px-2 ${lastCopied === "discharge" ? "bg-green-50 border-green-300 text-green-700" : ""}`}
                    onClick={() => copy("discharge", discharge)}
                    disabled={!discharge}
                    data-testid="btn-copy-discharge"
                  >
                    {lastCopied === "discharge" ? "✓ Copied" : "Copy"} <span className="ml-1 text-muted-foreground">Ctrl+D</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[140px]">
                  <pre className="text-[10px] font-mono text-gray-700 whitespace-pre-wrap px-3 pb-3 leading-relaxed">
                    {discharge || "Analyze a message to generate a discharge message."}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
