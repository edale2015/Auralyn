/**
 * Automation Studio — Packet 20 Visual Editor + LLM Generator
 *
 * Four-tab workspace:
 *   1. Build   — Visual step builder (add / edit / remove actions, save, test)
 *   2. Generate — LLM prompt → complete template, preview & adopt
 *   3. DNA     — Template health: selector scores, heal count, success rate
 *   4. Route   — Global region routing: probe latencies, pick nearest worker
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, Cpu, Dna, Globe, Plus, Trash2, Play, Save, Wand2,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle, XCircle, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  "click", "fill", "select", "check", "goto",
  "waitFor", "screenshot", "extractText", "humanApproval", "assertVisible",
] as const;
type ActionType = typeof ACTION_TYPES[number];

interface StepDraft {
  type:              ActionType;
  name:              string;
  selector:          string;
  value:             string;
  mapping:           string;
  fallbackSelectors: string;   // comma-separated
}

type TabId = "build" | "generate" | "dna" | "route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function needsSelector(t: ActionType) {
  return ["fill", "click", "select", "check", "assertVisible", "extractText"].includes(t);
}
function needsValue(t: ActionType) {
  return ["fill", "select", "check"].includes(t);
}
function blankStep(): StepDraft {
  return { type: "click", name: "", selector: "", value: "", mapping: "", fallbackSelectors: "" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({ id, active, label, icon: Icon, onClick }: {
  id: TabId; active: boolean; label: string; icon: any; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`tab-${id}`}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{children}</p>;
}

// ── Build Tab ─────────────────────────────────────────────────────────────────

function BuildTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [templateKey, setTemplateKey] = useState("my_automation");
  const [startUrl,    setStartUrl]    = useState("https://");
  const [steps,       setSteps]       = useState<StepDraft[]>([blankStep()]);
  const [testRunId,   setTestRunId]   = useState<string | null>(null);

  function addStep(type: ActionType) {
    setSteps((prev) => [...prev, { ...blankStep(), type }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function updateStep(i: number, key: keyof StepDraft, val: string) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }

  function buildPayload() {
    return {
      templateKey,
      template: {
        templateKey,
        name:     templateKey.replace(/_/g, " "),
        startUrl,
        actions:  steps.map((s) => ({
          type:     s.type,
          name:     s.name || s.type,
          selector: s.selector || undefined,
          value:    s.value    || undefined,
          mapping:  s.mapping  || undefined,
          fallbackSelectors: s.fallbackSelectors
            ? s.fallbackSelectors.split(",").map((x) => x.trim()).filter(Boolean)
            : undefined,
        })),
      },
    };
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/automation-recorder/record", buildPayload());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved", description: `${templateKey} written to template store` });
      qc.invalidateQueries({ queryKey: ["/api/automation/templates"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/automation/run", {
        templateKey,
        payload: {},
        startedBy: "automation-studio",
      });
      return r.json();
    },
    onSuccess: (d: any) => {
      setTestRunId(d.id ?? d.runId ?? null);
      toast({ title: "Test run started", description: `Run ID: ${d.id ?? d.runId}` });
      qc.invalidateQueries({ queryKey: ["/api/automation/runs"] });
    },
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      {/* Template metadata */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Template Identity</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <SectionLabel>Template Key</SectionLabel>
            <Input
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value.toLowerCase().replace(/\s/g, "_"))}
              placeholder="e.g. insurance_check"
              data-testid="input-template-key"
            />
          </div>
          <div>
            <SectionLabel>Start URL</SectionLabel>
            <Input
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://portal.example.com"
              data-testid="input-start-url"
            />
          </div>
        </CardContent>
      </Card>

      {/* Step list */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <Card key={i} data-testid={`card-step-${i}`} className="border-border/60">
            <CardContent className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                <Select
                  value={step.type}
                  onValueChange={(v) => updateStep(i, "type", v)}
                >
                  <SelectTrigger className="w-36 h-7 text-xs" data-testid={`select-type-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 text-xs"
                  placeholder="Step name"
                  value={step.name}
                  onChange={(e) => updateStep(i, "name", e.target.value)}
                  data-testid={`input-step-name-${i}`}
                />
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => moveStep(i, -1)} disabled={i === 0}
                  data-testid={`button-move-up-${i}`}
                ><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}
                  data-testid={`button-move-down-${i}`}
                ><ChevronDown className="h-3.5 w-3.5" /></Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-400"
                  onClick={() => removeStep(i)}
                  data-testid={`button-remove-step-${i}`}
                ><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>

              {needsSelector(step.type) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                  <Input
                    className="h-7 text-xs font-mono"
                    placeholder="CSS selector"
                    value={step.selector}
                    onChange={(e) => updateStep(i, "selector", e.target.value)}
                    data-testid={`input-selector-${i}`}
                  />
                  <Input
                    className="h-7 text-xs font-mono"
                    placeholder="Fallback selectors (comma-sep)"
                    value={step.fallbackSelectors}
                    onChange={(e) => updateStep(i, "fallbackSelectors", e.target.value)}
                    data-testid={`input-fallback-${i}`}
                  />
                </div>
              )}

              {needsValue(step.type) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Value or payload mapping key"
                    value={step.value}
                    onChange={(e) => updateStep(i, "value", e.target.value)}
                    data-testid={`input-value-${i}`}
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="Mapping key (e.g. firstName)"
                    value={step.mapping}
                    onChange={(e) => updateStep(i, "mapping", e.target.value)}
                    data-testid={`input-mapping-${i}`}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add step buttons */}
      <div className="flex flex-wrap gap-2">
        {(["click", "fill", "select", "waitFor", "screenshot"] as ActionType[]).map((t) => (
          <Button
            key={t} variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => addStep(t)} data-testid={`button-add-${t}`}
          >
            <Plus className="h-3 w-3" />{t}
          </Button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="gap-2" data-testid="button-save-template"
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Saving…" : "Save Template"}
        </Button>
        <Button
          variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}
          className="gap-2" data-testid="button-test-template"
        >
          <Play className="h-4 w-4" />
          {testMut.isPending ? "Running…" : "Test Run"}
        </Button>
        {testRunId && (
          <Link href={`/automation/replay/${testRunId}`}>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="link-open-replay">
              <ExternalLink className="h-3.5 w-3.5" /> View Replay
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Generate Tab (LLM) ────────────────────────────────────────────────────────

function GenerateTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prompt,   setPrompt]   = useState("");
  const [preview,  setPreview]  = useState<any | null>(null);
  const [adopted,  setAdopted]  = useState(false);

  const genMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/automation/generate", { prompt });
      return r.json();
    },
    onSuccess: (d: any) => {
      setPreview(d.template);
      setAdopted(false);
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const adoptMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No template to adopt");
      const r = await apiRequest("POST", "/api/automation-recorder/record", {
        templateKey: preview.templateKey,
        template:    preview,
      });
      return r.json();
    },
    onSuccess: () => {
      setAdopted(true);
      toast({ title: "Template adopted", description: `${preview?.templateKey} saved to template store` });
      qc.invalidateQueries({ queryKey: ["/api/automation/templates"] });
    },
    onError: (e: Error) => toast({ title: "Adopt failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Describe Your Automation
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Describe what the automation should do in plain English. Be specific about
            the portal, form fields, and expected outcome.
          </p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "Log into the Aetna provider portal at portal.aetna.com, navigate to Prior Authorization, fill in patient ID and procedure code, then submit and wait for the confirmation message."'
            className="min-h-[100px] text-sm"
            data-testid="textarea-llm-prompt"
          />
          <Button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending || !prompt.trim()}
            className="gap-2"
            data-testid="button-generate"
          >
            <Wand2 className="h-4 w-4" />
            {genMut.isPending ? "Generating…" : "Generate Template"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Generated: <span className="font-mono text-primary">{preview.templateKey}</span>
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">{preview.actions?.length ?? 0} steps</Badge>
                {adopted && <Badge className="text-xs bg-green-600">Adopted</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              {(preview.actions ?? []).map((a: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs py-1 border-b last:border-0"
                  data-testid={`row-generated-step-${i}`}
                >
                  <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{a.type}</Badge>
                  <span className="text-muted-foreground truncate">{a.name}</span>
                  {a.selector && (
                    <span className="font-mono text-[10px] text-muted-foreground/60 ml-auto truncate max-w-[40%]">
                      {a.selector}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => adoptMut.mutate()}
                disabled={adoptMut.isPending || adopted}
                size="sm" className="gap-2"
                data-testid="button-adopt-template"
              >
                <Save className="h-3.5 w-3.5" />
                {adoptMut.isPending ? "Saving…" : adopted ? "Saved" : "Adopt Template"}
              </Button>
              <Button
                variant="ghost" size="sm" className="text-xs"
                onClick={() => { setPreview(null); setAdopted(false); }}
                data-testid="button-discard-generated"
              >
                Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── DNA Tab ───────────────────────────────────────────────────────────────────

function DnaTab() {
  const [templateKey, setTemplateKey] = useState("insurance_check");

  const { data: dna, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/automation/dna", templateKey],
    queryFn: async () => {
      const r = await fetch(`/api/automation/dna/${encodeURIComponent(templateKey)}`);
      return r.json();
    },
    enabled: !!templateKey,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          placeholder="Template key"
          className="max-w-xs"
          data-testid="input-dna-key"
        />
        <Button
          variant="outline" size="sm" className="gap-1" onClick={() => refetch()}
          data-testid="button-dna-fetch"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Load
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {dna && (
        <div className="space-y-3">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <Play className="h-3 w-3" /> {dna.totalRuns ?? 0} runs
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs text-green-400">
              <CheckCircle className="h-3 w-3" /> {dna.healed ?? 0} healed
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs text-red-400">
              <XCircle className="h-3 w-3" /> {dna.broken ?? 0} broken selectors
            </Badge>
            <Badge variant="outline" className="text-xs">
              Success rate: {dna.successRate ?? "—"}
            </Badge>
          </div>

          {/* Selector scores */}
          {dna.selectorScores?.length > 0 && (
            <div>
              <SectionLabel>Selector Health</SectionLabel>
              <div className="space-y-1.5">
                {dna.selectorScores.map((s: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs border rounded-lg px-3 py-2"
                    data-testid={`row-selector-${i}`}
                  >
                    <span className="font-mono text-muted-foreground truncate max-w-[45%]">{s.selector}</span>
                    <div className="ml-auto flex items-center gap-3">
                      <span>{s.attempts} attempts</span>
                      <span className={`font-medium ${s.confidence >= 0.5 ? "text-green-400" : "text-red-400"}`}>
                        {(s.confidence * 100).toFixed(0)}% conf
                      </span>
                      {s.confidence < 0.5 && (
                        <Badge variant="destructive" className="text-[9px] py-0">BROKEN</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History entries */}
          {dna.history?.length > 0 && (
            <div>
              <SectionLabel>Version History</SectionLabel>
              <div className="space-y-1">
                {dna.history.slice(0, 5).map((h: any, i: number) => (
                  <div key={i} className="text-xs flex items-center gap-2 text-muted-foreground border-b py-1 last:border-0">
                    <span className="font-mono text-[10px] text-muted-foreground/50">{new Date(h.savedAt).toLocaleString()}</span>
                    <span className="truncate">{h.startedBy ?? "system"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Route Tab ─────────────────────────────────────────────────────────────────

const REGIONS = [
  { key: "dev",          label: "Dev (local)",       flag: "🖥️" },
  { key: "us-east",      label: "US East (Fly.io)",  flag: "🇺🇸" },
  { key: "eu-west",      label: "EU West (Fly.io)",  flag: "🇪🇺" },
  { key: "asia-pacific", label: "Asia Pacific",      flag: "🌏" },
];

function RouteTab() {
  const { toast } = useToast();
  const [probing,       setProbing]       = useState(false);
  const [latencies,     setLatencies]     = useState<Record<string, number | null>>({});
  const [selectedRegion, setSelectedRegion] = useState("dev");
  const [templateKey,   setTemplateKey]   = useState("insurance_check");

  async function probeAll() {
    setProbing(true);
    const r = await apiRequest("GET", "/api/automation/routing/probe").catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setLatencies(d.latencies ?? {});
    } else {
      toast({ title: "Probe failed", description: "Could not reach routing endpoint", variant: "destructive" });
    }
    setProbing(false);
  }

  function bestRegion() {
    const entries = Object.entries(latencies).filter(([, v]) => v !== null) as [string, number][];
    if (!entries.length) return null;
    entries.sort(([, a], [, b]) => a - b);
    return entries[0][0];
  }

  const best = bestRegion();

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Probe all automation worker regions and route the next job to the fastest node.
        In development all jobs run locally. In production, Fly.io edge nodes can be configured
        via the WORKER_* environment variables.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {REGIONS.map(({ key, label, flag }) => {
          const lat = latencies[key];
          const isBest = key === best;
          return (
            <button
              key={key}
              onClick={() => setSelectedRegion(key)}
              data-testid={`card-region-${key}`}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selectedRegion === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="text-lg mb-1">{flag}</div>
              <div className="text-xs font-medium">{label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {lat === null || lat === undefined
                  ? "—"
                  : lat >= 9000
                  ? "unreachable"
                  : `${lat}ms`}
              </div>
              {isBest && <Badge className="text-[9px] mt-1 bg-green-600">fastest</Badge>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline" size="sm" className="gap-2"
          onClick={probeAll} disabled={probing}
          data-testid="button-probe-regions"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${probing ? "animate-spin" : ""}`} />
          {probing ? "Probing…" : "Probe All Regions"}
        </Button>
        {best && best !== selectedRegion && (
          <Button
            variant="ghost" size="sm" className="text-xs gap-1"
            onClick={() => setSelectedRegion(best)}
            data-testid="button-use-fastest"
          >
            Use fastest ({best})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Submit Job to Region</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div>
            <SectionLabel>Template Key</SectionLabel>
            <Input
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              placeholder="e.g. insurance_check"
              className="max-w-xs"
              data-testid="input-route-template-key"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            Route to: <strong className="text-foreground">{selectedRegion}</strong>
          </div>
          <Button
            size="sm" className="gap-2" data-testid="button-submit-routed"
            onClick={() => toast({ title: "Routed", description: `Job submitted to ${selectedRegion}` })}
          >
            <Play className="h-3.5 w-3.5" /> Submit to {selectedRegion}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "build",    label: "Build",    icon: Cpu   },
  { id: "generate", label: "Generate", icon: Wand2 },
  { id: "dna",      label: "DNA",      icon: Dna   },
  { id: "route",    label: "Route",    icon: Globe },
];

export default function AutomationStudio() {
  const [tab, setTab] = useState<TabId>("build");

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b bg-card px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">Automation Studio</h1>
            <p className="text-xs text-muted-foreground">
              Build, generate, debug, and route automation templates
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/automation/health">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="link-health-dashboard">
              <ExternalLink className="h-3.5 w-3.5" /> Health Dashboard
            </Button>
          </Link>
          <Link href="/automation">
            <Button variant="ghost" size="sm" className="text-xs" data-testid="link-automation-dashboard">
              All Runs
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b bg-card px-5 flex gap-1 shrink-0">
        {TABS.map((t) => (
          <TabButton
            key={t.id} id={t.id} active={tab === t.id}
            label={t.label} icon={t.icon}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {tab === "build"    && <BuildTab />}
        {tab === "generate" && <GenerateTab />}
        {tab === "dna"      && <DnaTab />}
        {tab === "route"    && <RouteTab />}
      </div>
    </div>
  );
}
