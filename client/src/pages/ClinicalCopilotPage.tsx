import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, AlertTriangle, BarChart2, FileText, HelpCircle, ShieldCheck, Zap, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type RiskColor = "green" | "yellow" | "orange" | "red";

interface CopilotSuggestion {
  category: string;
  priority: string;
  title: string;
  content: string;
  action?: string;
}

interface CopilotOutput {
  suggestions: CopilotSuggestion[];
  riskIndicator: RiskColor;
  summary: string;
  documentationHelp?: { hpi: string; assessment: string; plan: string };
}

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  scoring:       { icon: BarChart2,   color: "text-blue-600",   label: "Scoring" },
  differential:  { icon: Lightbulb,   color: "text-yellow-600", label: "Differential" },
  red_flag:      { icon: AlertTriangle,color: "text-red-600",   label: "Red Flag" },
  documentation: { icon: FileText,    color: "text-gray-600",   label: "Documentation" },
  question:      { icon: HelpCircle,  color: "text-purple-600", label: "Questions" },
  pathway:       { icon: Zap,         color: "text-green-600",  label: "Pathway" },
  safety:        { icon: ShieldCheck, color: "text-orange-600", label: "Safety" },
};

const RISK_COLORS: Record<RiskColor, { bg: string; text: string; label: string; ring: string }> = {
  green:  { bg: "bg-green-100",  text: "text-green-800",  label: "All Clear",       ring: "ring-green-400" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Attention",        ring: "ring-yellow-400" },
  orange: { bg: "bg-orange-100", text: "text-orange-800", label: "Urgent Review",    ring: "ring-orange-400" },
  red:    { bg: "bg-red-100",    text: "text-red-800",    label: "Critical",         ring: "ring-red-500" },
};

const COMPLAINTS = ["sore_throat", "uti", "cough", "ear_pain", "fever", "chest_pain", "rash", "sinus_pressure", "abdominal_pain"];
const DISPOSITIONS = ["Home Care", "Prescription", "Urgent Care", "ED"];

function RiskGauge({ indicator }: { indicator: RiskColor }) {
  const cfg = RISK_COLORS[indicator];
  const pct = { green: 15, yellow: 40, orange: 70, red: 95 }[indicator];
  return (
    <div className={`rounded-xl p-4 ${cfg.bg} ring-2 ${cfg.ring} flex flex-col items-center`}>
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle cx="50" cy="50" r="40" fill="none"
            stroke={indicator === "green" ? "#22c55e" : indicator === "yellow" ? "#eab308" : indicator === "orange" ? "#f97316" : "#ef4444"}
            strokeWidth="12"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - (pct ?? 0) / 100)}`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold ${cfg.text}`}>{pct}%</span>
        </div>
      </div>
      <p className={`text-sm font-bold mt-2 ${cfg.text}`}>{cfg.label}</p>
    </div>
  );
}

export default function ClinicalCopilotPage() {
  const { toast } = useToast();
  const [caseId] = useState(() => `copilot_${Date.now()}`);
  const [complaint, setComplaint] = useState("");
  const [disposition, setDisposition] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [redFlagsInput, setRedFlagsInput] = useState("");
  const [output, setOutput] = useState<CopilotOutput | null>(null);

  const copilotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/copilot/suggestions", {
      caseId,
      complaint,
      disposition,
      symptoms,
      redFlags: redFlagsInput.trim() ? redFlagsInput.split(",").map(s => s.trim()).filter(Boolean) : [],
    }),
    onSuccess: (data: CopilotOutput) => setOutput(data),
    onError: () => toast({ title: "Copilot error", variant: "destructive" }),
  });

  function copyDoc(text: string) {
    navigator.clipboard.writeText(text).then(() => toast({ title: "Copied to clipboard" }));
  }

  const grouped = output?.suggestions.reduce((acc: Record<string, CopilotSuggestion[]>, s) => {
    acc[s.category] = [...(acc[s.category] ?? []), s];
    return acc;
  }, {}) ?? {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-yellow-500" />
          Clinician Copilot
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time AI guidance — scoring hints, differential narrowing, safety checks, and documentation assistance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clinical Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Complaint</label>
                <Select onValueChange={setComplaint} data-testid="select-copilot-complaint">
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Disposition</label>
                <Select onValueChange={setDisposition} data-testid="select-copilot-disposition">
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Symptoms / Clinical Notes</label>
              <Textarea
                data-testid="input-symptoms"
                placeholder="Patient presents with…"
                rows={4}
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Red Flags (comma-separated, optional)</label>
              <Textarea
                data-testid="input-red-flags"
                placeholder="e.g. chest pain with arm radiation, shortness of breath"
                rows={2}
                value={redFlagsInput}
                onChange={e => setRedFlagsInput(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => copilotMutation.mutate()}
              disabled={copilotMutation.isPending || !complaint}
              data-testid="button-run-copilot"
            >
              <Zap className="h-4 w-4 mr-2" />
              {copilotMutation.isPending ? "Analyzing…" : "Run Copilot"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {output ? (
            <>
              <div className="flex gap-4 items-start">
                <RiskGauge indicator={output.riskIndicator} />
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1">Copilot Summary</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-copilot-summary">{output.summary}</p>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <Badge variant="outline">{output.suggestions.length} suggestions</Badge>
                    <Badge variant="outline">{output.suggestions.filter(s => s.priority === "high").length} high priority</Badge>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="border rounded-xl h-48 flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
              <div className="text-center">
                <Lightbulb className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Select a complaint and run the copilot to see guidance
              </div>
            </div>
          )}
        </div>
      </div>

      {output && (
        <Tabs defaultValue="suggestions">
          <TabsList>
            <TabsTrigger value="suggestions">Suggestions ({output.suggestions.length})</TabsTrigger>
            {output.documentationHelp && <TabsTrigger value="documentation">Documentation Helper</TabsTrigger>}
          </TabsList>

          <TabsContent value="suggestions" className="space-y-3">
            {Object.entries(grouped).map(([category, items]) => {
              const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.documentation;
              const Icon = cfg.icon;
              return (
                <Card key={category}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      {cfg.label}
                      <Badge variant="outline" className="ml-auto">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {items.map((s, i) => (
                      <div key={i} className="border rounded-lg p-3" data-testid={`suggestion-${category}-${i}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{s.title}</p>
                          <Badge
                            className={s.priority === "high" ? "bg-red-100 text-red-800" : s.priority === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}
                          >
                            {s.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-line">{s.content}</p>
                        {s.action && (
                          <p className="text-xs text-blue-600 font-medium mt-1">→ {s.action}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {output.documentationHelp && (
            <TabsContent value="documentation" className="space-y-3">
              {[
                { key: "hpi", label: "History of Present Illness (HPI)", field: output.documentationHelp.hpi },
                { key: "assessment", label: "Assessment", field: output.documentationHelp.assessment },
                { key: "plan", label: "Plan", field: output.documentationHelp.plan },
              ].map(section => (
                <Card key={section.key}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center justify-between">
                      {section.label}
                      <Button variant="ghost" size="sm" onClick={() => copyDoc(section.field)} data-testid={`button-copy-${section.key}`}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground font-mono bg-muted rounded p-3 whitespace-pre-wrap" data-testid={`text-doc-${section.key}`}>
                      {section.field}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
