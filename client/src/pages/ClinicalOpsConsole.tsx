import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Brain, Activity, MessageSquare, CheckCircle, XCircle, AlertTriangle, Lock, TrendingUp } from "lucide-react";

const DISPOSITION_COLORS: Record<string, string> = {
  er_now: "bg-red-100 text-red-800 border-red-300",
  urgent_care: "bg-orange-100 text-orange-800 border-orange-300",
  routine: "bg-blue-100 text-blue-800 border-blue-300",
  home_care: "bg-green-100 text-green-800 border-green-300",
  need_more_info: "bg-yellow-100 text-yellow-800 border-yellow-300",
  uncertain: "bg-gray-100 text-gray-800 border-gray-300",
};

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ExtractionTab() {
  const [text, setText] = useState("I have severe chest pain that radiates to my left arm and I'm sweating a lot");
  const [age, setAge] = useState("52");
  const [sex, setSex] = useState("male");
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hybrid/extract", { text, age: parseInt(age) || undefined, sex: sex || undefined }),
    onSuccess: async (res) => {
      const data = await res.json();
      setResult(data);
    },
    onError: () => toast({ title: "Error", description: "Extraction failed", variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Patient Input</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              data-testid="input-extract-text"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              placeholder="Patient's free-text description of symptoms..."
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Age</label>
                <Input data-testid="input-extract-age" value={age} onChange={e => setAge(e.target.value)} placeholder="Age" type="number" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Sex</label>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger data-testid="select-extract-sex"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button data-testid="button-run-extraction" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? "Analyzing..." : "Run Extraction Confidence"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className={result.canProceed ? "border-green-300" : "border-red-300"}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                {result.canProceed
                  ? <CheckCircle className="h-4 w-4 text-green-500" />
                  : <XCircle className="h-4 w-4 text-red-500" />}
                {result.canProceed ? "Extraction Successful — Triage Can Proceed" : "Extraction Blocked — More Data Needed"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConfidenceBar value={result.confidence} label="Extraction Confidence" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Complaint</span>
                  <div className="font-mono font-bold mt-1">{result.complaint.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Features Found</span>
                  <div className="font-mono font-bold mt-1">{result.featuresFound}</div>
                </div>
              </div>
              {!result.canProceed && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded p-3 text-sm">
                  <div className="font-semibold text-red-700 mb-1">Block Reason</div>
                  <div className="text-red-600">{result.blockReason}</div>
                  <div className="mt-2 font-semibold text-red-700">Next Question</div>
                  <div className="text-red-600 italic">{result.nextQuestion}</div>
                </div>
              )}
              {result.missingFields?.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Missing Fields</div>
                  <div className="flex gap-1 flex-wrap">
                    {result.missingFields.map((f: string) => (
                      <Badge key={f} variant="outline" className="text-yellow-700 border-yellow-400 text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-sm">Extracted Features ({result.features?.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {result.features?.map((f: string) => (
                    <Badge key={f} variant="secondary" className="text-xs">{f.replace(/_/g, " ")}</Badge>
                  ))}
                  {result.features?.length === 0 && <div className="text-muted-foreground text-sm">No features extracted</div>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Extraction Log</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 font-mono text-xs">
                  {result.extractionLog?.map((line: string, i: number) => (
                    <div key={i} className={line.startsWith("+0.00") ? "text-muted-foreground" : "text-green-700 dark:text-green-400"}>{line}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
            {result.nextQuestion && result.canProceed && (
              <Card className="border-blue-200">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground mb-1">Suggested Follow-up Question</div>
                  <div className="italic text-sm">{result.nextQuestion}</div>
                </CardContent>
              </Card>
            )}
          </>
        )}
        {!result && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Run extraction to see results
          </div>
        )}
      </div>
    </div>
  );
}

function SafetyRegistryTab() {
  const { data: registry, isLoading } = useQuery({
    queryKey: ["/api/hybrid/safety-registry"],
    queryFn: () => fetch("/api/hybrid/safety-registry").then(r => r.json()),
  });
  const { data: integrity } = useQuery({
    queryKey: ["/api/hybrid/safety-registry/verify"],
    queryFn: () => fetch("/api/hybrid/safety-registry/verify").then(r => r.json()),
  });

  const [checkComplaint, setCheckComplaint] = useState("chest_pain");
  const [checkFeatures, setCheckFeatures] = useState("radiates_left_arm,diaphoresis");
  const [checkResult, setCheckResult] = useState<any>(null);

  const checkMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hybrid/safety-registry/check", {
      complaint: checkComplaint,
      features: checkFeatures.split(",").map(f => f.trim()).filter(Boolean),
    }),
    onSuccess: async (res) => setCheckResult(await res.json()),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading registry...</div>;

  const byComplaint: Record<string, any[]> = {};
  for (const rule of registry?.rules ?? []) {
    if (!byComplaint[rule.complaint]) byComplaint[rule.complaint] = [];
    byComplaint[rule.complaint].push(rule);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border ${integrity?.valid ? "bg-green-50 border-green-300 text-green-700" : "bg-red-50 border-red-300 text-red-700"}`}>
          <Lock className="h-3.5 w-3.5" />
          {integrity?.valid ? "All rules verified — no tampering detected" : `INTEGRITY VIOLATION: ${integrity?.violations?.join(", ")}`}
        </div>
        <div className="text-xs text-muted-foreground">
          {registry?.meta?.total_rules} rules · {registry?.meta?.complaints_covered} complaints covered · v{registry?.meta?.version}
        </div>
      </div>

      <Card className="border-blue-200">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-blue-500" />Rule Checker</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Complaint</label>
              <Input data-testid="input-check-complaint" value={checkComplaint} onChange={e => setCheckComplaint(e.target.value)} placeholder="e.g. chest_pain" />
            </div>
            <div className="flex-[2]">
              <label className="text-xs text-muted-foreground mb-1 block">Features (comma-separated)</label>
              <Input data-testid="input-check-features" value={checkFeatures} onChange={e => setCheckFeatures(e.target.value)} placeholder="radiates_left_arm,diaphoresis" />
            </div>
            <div className="flex items-end">
              <Button data-testid="button-check-rules" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending} size="sm">Check</Button>
            </div>
          </div>
          {checkResult && (
            <div className={`p-3 rounded border text-sm ${checkResult.triggered ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"}`}>
              {checkResult.triggered ? (
                <>
                  <div className="font-bold text-red-700 mb-1">🔒 {checkResult.rules?.length} Locked Rule(s) Triggered — Mandatory ER</div>
                  {checkResult.rules?.map((r: any) => (
                    <div key={r.id} className="text-red-600 text-xs mt-1"><span className="font-mono">[{r.id}]</span> {r.rationale}</div>
                  ))}
                </>
              ) : (
                <div className="text-green-700">✓ No locked safety rules triggered for this combination.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {Object.entries(byComplaint).map(([complaint, rules]) => (
          <Card key={complaint}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{complaint.replace(/_/g, " ")} ({rules.length} rules)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rules.map((rule: any) => (
                  <div key={rule.id} data-testid={`rule-${rule.id}`} className="flex items-start gap-3 p-2 bg-muted/40 rounded border text-xs">
                    <Lock className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-blue-700">{rule.id}</span>
                        <div className="flex gap-1 flex-wrap">
                          {rule.trigger_features.map((f: string) => (
                            <Badge key={f} variant="outline" className="text-xs border-orange-400 text-orange-700">{f.replace(/_/g, " ")}</Badge>
                          ))}
                        </div>
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">{rule.mandatory_disposition}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-1">{rule.rationale}</div>
                    </div>
                    <div className="font-mono text-muted-foreground shrink-0">{rule.audit_hash}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OutcomeFeedbackTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useQuery({
    queryKey: ["/api/hybrid/outcome-feedback/stats"],
    queryFn: () => fetch("/api/hybrid/outcome-feedback/stats").then(r => r.json()),
    refetchInterval: 10000,
  });

  const { data: recent } = useQuery({
    queryKey: ["/api/hybrid/outcome-feedback/recent"],
    queryFn: () => fetch("/api/hybrid/outcome-feedback/recent").then(r => r.json()),
    refetchInterval: 10000,
  });

  const [form, setForm] = useState({
    caseId: `CASE_${Date.now()}`,
    complaint: "chest_pain",
    symptoms: "chest_pain,radiates_left_arm",
    aiDisposition: "er_now",
    aiTopDiagnosis: "acute_coronary_syndrome",
    aiConfidence: "0.85",
    finalDisposition: "er_now",
    finalDiagnosis: "acute_coronary_syndrome",
    overrideReason: "",
  });

  const feedbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hybrid/outcome-feedback", {
      ...form,
      symptoms: form.symptoms.split(",").map(s => s.trim()),
      aiConfidence: parseFloat(form.aiConfidence),
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Feedback recorded", description: `Reward: ${data.feedback?.reward > 0 ? "+" : ""}${data.feedback?.reward}` });
      qc.invalidateQueries({ queryKey: ["/api/hybrid/outcome-feedback/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/hybrid/outcome-feedback/recent"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to record feedback", variant: "destructive" }),
  });

  const statCards = [
    { label: "Total Feedbacks", value: stats?.total_feedbacks ?? 0, icon: Activity },
    { label: "Override Rate", value: `${Math.round((stats?.override_rate ?? 0) * 100)}%`, icon: AlertTriangle },
    { label: "Avg Reward", value: stats?.avg_reward?.toFixed(2) ?? "—", icon: TrendingUp },
    { label: "Avg Brier Score", value: stats?.avg_brier?.toFixed(3) ?? "—", icon: Brain },
    { label: "Accuracy Rate", value: `${Math.round((stats?.accuracy_rate ?? 0) * 100)}%`, icon: CheckCircle },
    { label: "Recalibrations", value: stats?.recalibration_runs ?? 0, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 flex items-center gap-3">
              <Icon className="h-8 w-8 text-primary opacity-70" />
              <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Record Outcome Feedback</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(form).map(([key, val]) => (
                key !== "overrideReason" ? (
                  <div key={key}>
                    <label className="text-muted-foreground capitalize mb-1 block">{key.replace(/([A-Z])/g, " $1")}</label>
                    <Input
                      data-testid={`input-feedback-${key}`}
                      value={val}
                      onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                      className="text-xs h-7"
                    />
                  </div>
                ) : null
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Override Reason (if physician changed the AI's recommendation)</label>
              <Textarea
                data-testid="input-feedback-override"
                value={form.overrideReason}
                onChange={e => setForm(prev => ({ ...prev, overrideReason: e.target.value }))}
                rows={2}
                className="text-xs"
                placeholder="Why did the physician change the disposition?"
              />
            </div>
            <Button data-testid="button-submit-feedback" onClick={() => feedbackMutation.mutate()} disabled={feedbackMutation.isPending} className="w-full">
              {feedbackMutation.isPending ? "Recording..." : "Record Outcome & Recalibrate"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Per-Complaint Accuracy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats?.by_complaint && Object.entries(stats.by_complaint).length > 0 ? (
              Object.entries(stats.by_complaint).map(([complaint, data]: [string, any]) => (
                <div key={complaint} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize">{complaint.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{data.correct}/{data.total} correct · {data.overrides} overrides</span>
                  </div>
                  <Progress value={(data.correct / Math.max(1, data.total)) * 100} className="h-1.5" />
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground text-sm py-4">No feedback recorded yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Feedbacks</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(recent ?? []).slice(0, 10).map((fb: any) => (
              <div key={fb.feedbackId} data-testid={`feedback-${fb.feedbackId}`} className="flex items-start gap-3 p-2 border rounded text-xs">
                <div className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${fb.reward > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {fb.reward > 0 ? "+" : ""}{fb.reward}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-muted-foreground">{fb.caseId}</div>
                  <div>{fb.complaint.replace(/_/g, " ")} · AI: <span className={`font-semibold ${DISPOSITION_COLORS[fb.aiDisposition]?.split(" ")[1]}`}>{fb.aiDisposition}</span> → Final: <span className="font-semibold">{fb.finalDisposition}</span></div>
                  {fb.physicianOverride && <div className="text-orange-600">⚠ Physician override</div>}
                </div>
                <div className="shrink-0 text-muted-foreground">{new Date(fb.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
            {(!recent || recent.length === 0) && (
              <div className="text-center text-muted-foreground text-sm py-4">No feedback records yet</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BotFormatterTab() {
  const [message, setMessage] = useState("I have severe chest pain radiating to my left arm with sweating");
  const [channel, setChannel] = useState<"whatsapp" | "telegram" | "sms">("telegram");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const { toast } = useToast();

  const handlePreview = async () => {
    try {
      const extractRes = await fetch("/api/hybrid/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message, age: 52, sex: "male" }),
      });
      const extraction = await extractRes.json();

      const evalRes = await fetch("/api/hybrid/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint: extraction.complaint, features: extraction.features, age: 52, sex: "male", generateExplanation: true }),
      });
      const triage = await evalRes.json();

      const CHANNEL_LIMITS: Record<string, number> = { sms: 160, whatsapp: 1600, telegram: 4096 };
      const limit = CHANNEL_LIMITS[channel];
      const useMarkdown = channel === "telegram";
      const b = (t: string) => useMarkdown ? `*${t}*` : t;

      const dispMap: Record<string, { emoji: string; header: string; cta: string }> = {
        er_now: { emoji: "🚨", header: "URGENT — EMERGENCY ROOM NOW", cta: "Please call 911 or go to the nearest Emergency Room immediately." },
        urgent_care: { emoji: "⚡", header: "Please visit Urgent Care", cta: "Visit an Urgent Care clinic within 2-4 hours." },
        routine: { emoji: "📋", header: "Schedule a Doctor's Appointment", cta: "Follow up with your primary care doctor within 2-3 days." },
        home_care: { emoji: "🏠", header: "Home Care Recommended", cta: "Rest, stay hydrated, and monitor your symptoms." },
        need_more_info: { emoji: "❓", header: "More Information Needed", cta: "Please answer the question above." },
        uncertain: { emoji: "🤔", header: "Unable to Determine", cta: "Please consult a healthcare provider." },
      };
      const disp = triage.disposition ?? "uncertain";
      const info = dispMap[disp] ?? dispMap.uncertain;

      const lines = [
        `${info.emoji} ${b(info.header)}`,
        useMarkdown ? "─────────────────" : "---",
        `${b("Complaint:")} ${extraction.complaint.replace(/_/g, " ")}`,
        `${b("Likely cause:")} ${(triage.layer3_ensemble_differential?.[0]?.diagnosis ?? "Unknown").replace(/_/g, " ")}`,
        `${b("Confidence:")} ${Math.round(triage.confidence * 100)}%`,
      ];
      if (triage.layer1_safety?.triggered_flags?.length) {
        lines.push(`\n⚠️ ${b("Red flags detected:")}`);
        for (const f of triage.layer1_safety.triggered_flags) lines.push(`  • ${f.replace(/_/g, " ")}`);
      }
      if (triage.layer4_explanation && channel !== "sms") {
        lines.push(`\n${b("Reasoning:")}`);
        lines.push(triage.layer4_explanation.slice(0, 200));
      }
      lines.push(useMarkdown ? "─────────────────" : "---");
      lines.push(info.cta);
      if (channel !== "sms") {
        lines.push(`\n${b("Return if:")} Chest pain · Fever >39°C · Confusion · Severe worsening`);
      }

      const text = lines.join("\n");
      const chunks: string[] = [];
      let start = 0;
      while (start < text.length) {
        chunks.push(text.slice(start, start + limit).trim());
        start += limit;
      }

      setPreviewResult({ text, chunks, characterCount: text.length, limit, extraction, disp });
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Message Formatter Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              data-testid="input-bot-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              placeholder="Patient message..."
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Channel</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
                <SelectTrigger data-testid="select-bot-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telegram">Telegram (4096 chars, Markdown)</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (1600 chars)</SelectItem>
                  <SelectItem value="sms">SMS (160 chars)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="button-preview-bot" onClick={handlePreview} className="w-full">Generate Formatted Message</Button>
          </CardContent>
        </Card>

        {previewResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Extraction Summary</span>
                <Badge className={DISPOSITION_COLORS[previewResult.disp]}>
                  {previewResult.disp.replace(/_/g, " ")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div>Complaint: <span className="font-semibold">{previewResult.extraction.complaint}</span></div>
              <div>Features: {previewResult.extraction.features?.join(", ")}</div>
              <div>Confidence: <span className="font-semibold">{Math.round(previewResult.extraction.confidence * 100)}%</span></div>
              <div className={!previewResult.extraction.canProceed ? "text-red-600" : "text-green-600"}>
                {previewResult.extraction.canProceed ? "✓ Triage proceeded" : `✗ Blocked: ${previewResult.extraction.blockReason}`}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {previewResult && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{previewResult.characterCount} characters · {previewResult.chunks.length} message chunk(s)</span>
              <span>Limit: {previewResult.limit}</span>
            </div>
            {previewResult.chunks.map((chunk: string, i: number) => (
              <Card key={i} className="border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Message {i + 1} of {previewResult.chunks.length}</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre data-testid={`bot-message-chunk-${i}`} className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded p-3">
                    {chunk}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </>
        )}
        {!previewResult && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Generate a formatted message to preview it
          </div>
        )}
      </div>
    </div>
  );
}

function DatasetTab() {
  const { data: stats } = useQuery({
    queryKey: ["/api/hybrid/dataset/stats"],
    queryFn: () => fetch("/api/hybrid/dataset/stats").then(r => r.json()),
  });

  if (!stats) return <div className="text-center py-8 text-muted-foreground">Loading dataset stats...</div>;

  const complaints = Object.entries(stats.byComplaint ?? {}).sort(([, a], [, b]) => (b as number) - (a as number));
  const maxCount = Math.max(...complaints.map(([, v]) => v as number));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Cases", value: stats.total },
          { label: "Complaints", value: complaints.length },
          { label: "Adversarial Traps", value: stats.adversarial },
          { label: "ER Mandatory", value: stats.byDisposition?.er_now ?? 0 },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Cases by Complaint</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {complaints.map(([complaint, count]) => (
            <div key={complaint} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="capitalize">{complaint.replace(/_/g, " ")}</span>
                <span className="font-mono">{count as number}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((count as number) / maxCount * 100)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Disposition Distribution</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {Object.entries(stats.byDisposition ?? {}).map(([disp, count]) => (
            <div key={disp} className={`p-3 rounded border text-center ${DISPOSITION_COLORS[disp] ?? ""}`}>
              <div className="text-xl font-bold">{count as number}</div>
              <div className="text-xs capitalize">{disp.replace(/_/g, " ")}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClinicalOpsConsole() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Clinical Ops Console</h1>
          <p className="text-sm text-muted-foreground">Extraction confidence · Locked safety rules · Outcome feedback · Dataset · Bot formatter</p>
        </div>
      </div>

      <Tabs defaultValue="extraction">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="extraction" data-testid="tab-extraction"><Brain className="h-3.5 w-3.5 mr-1" />Extraction Confidence</TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety"><Lock className="h-3.5 w-3.5 mr-1" />Locked Safety Registry</TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-feedback"><TrendingUp className="h-3.5 w-3.5 mr-1" />Outcome Feedback</TabsTrigger>
          <TabsTrigger value="dataset" data-testid="tab-dataset"><Activity className="h-3.5 w-3.5 mr-1" />Dataset Coverage</TabsTrigger>
          <TabsTrigger value="bot" data-testid="tab-bot"><MessageSquare className="h-3.5 w-3.5 mr-1" />Bot Formatter</TabsTrigger>
        </TabsList>

        <TabsContent value="extraction" className="mt-4"><ExtractionTab /></TabsContent>
        <TabsContent value="safety" className="mt-4"><SafetyRegistryTab /></TabsContent>
        <TabsContent value="feedback" className="mt-4"><OutcomeFeedbackTab /></TabsContent>
        <TabsContent value="dataset" className="mt-4"><DatasetTab /></TabsContent>
        <TabsContent value="bot" className="mt-4"><BotFormatterTab /></TabsContent>
      </Tabs>
    </div>
  );
}
