import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Search, Cpu, Activity, Plug, Stethoscope, ShieldCheck,
  BookOpen, ChevronRight, ToggleLeft, ToggleRight
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function statusBadge(s: string) {
  const cls = s === "healthy" ? "bg-emerald-600 text-white" : s === "degraded" ? "bg-yellow-500 text-white" : "bg-gray-400 text-white";
  return <Badge className={cls}>{s}</Badge>;
}

/* ─── Plugin Registry Panel ──────────────────────────────────────────────── */
function PluginsPanel() {
  const { data: plugins = [], refetch } = useQuery<any[]>({ queryKey: ["/api/agents/plugins"] });

  const toggle = useMutation({
    mutationFn: (body: { name: string; status: string }) =>
      apiRequest("POST", "/api/agents/plugins/toggle", body),
    onSuccess: () => refetch(),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Plug className="w-4 h-4"/>Medical Plugin Registry</CardTitle></CardHeader>
      <CardContent>
        <div className="divide-y">
          {plugins.map((p: any, i: number) => (
            <div key={i} data-testid={`row-plugin-${p.name}`} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
              <div className="text-xs text-muted-foreground w-16 text-right">{p.latencyMs}ms</div>
              <div className="text-xs text-muted-foreground w-16 text-right">{p.callCount} calls</div>
              {statusBadge(p.status)}
              <Button
                variant="ghost" size="sm"
                data-testid={`btn-toggle-${p.name}`}
                onClick={() => toggle.mutate({ name: p.name, status: p.status === "disabled" ? "healthy" : "disabled" })}
                disabled={toggle.isPending}
              >
                {p.status === "disabled" ? <ToggleLeft className="w-4 h-4 text-gray-400"/> : <ToggleRight className="w-4 h-4 text-emerald-500"/>}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Sequential Reasoner Panel ──────────────────────────────────────────── */
function ReasonerPanel() {
  const [symptoms, setSymptoms]     = useState("cough, fever");
  const [redFlags,  setRedFlagsRaw] = useState("");
  const [result,    setResult]      = useState<any>(null);

  const run = useMutation({
    mutationFn: async () =>
      apiRequest<any>("POST", "/api/agents/reason", {
        symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean),
        redFlags: redFlags ? redFlags.split(",").map((s) => s.trim()) : false,
      }),
    onSuccess: setResult,
  });

  const stepColor = (s: string) =>
    s === "override" ? "bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-700" :
    s === "skipped"  ? "bg-gray-50 border-gray-200"  :
                       "bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-700";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4"/>Sequential Clinical Reasoner</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1 block">Symptoms</Label>
            <Input data-testid="input-reason-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Red Flags (comma-separated, blank = none)</Label>
            <Input data-testid="input-reason-redflags" value={redFlags} onChange={(e) => setRedFlagsRaw(e.target.value)} placeholder="diaphoresis, syncope" />
          </div>
          <Button data-testid="btn-run-reasoner" onClick={() => run.mutate()} disabled={run.isPending} className="w-full">
            {run.isPending ? "Reasoning…" : "Run Step-by-Step Reasoner"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Diagnosis</p><p data-testid="text-reasoner-dx" className="font-semibold">{result.diagnosis ?? "—"}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Disposition</p><Badge className={result.disposition==="ED"?"bg-red-600 text-white":result.disposition==="URGENT_CARE"?"bg-orange-500 text-white":"bg-emerald-600 text-white"}>{result.disposition}</Badge></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{result.totalMs}ms · {result.reasoning?.length} steps</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Reasoning Trace</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {result.reasoning?.map((step: any, i: number) => (
                <div key={i} data-testid={`step-${i}`} className={`p-2 rounded border text-xs ${stepColor(step.status)}`}>
                  <div className="flex items-center gap-2 font-medium">
                    <ChevronRight className="w-3 h-3 shrink-0"/>
                    <span>{step.step}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">{step.status}</Badge>
                    <span className="text-muted-foreground">{step.durationMs}ms</span>
                  </div>
                  <pre className="mt-1 text-muted-foreground whitespace-pre-wrap text-[10px] leading-relaxed">
                    {JSON.stringify(step.data, null, 2)}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── Evidence Panel ─────────────────────────────────────────────────────── */
function EvidencePanel() {
  const [query, setQuery]     = useState("myocardial infarction treatment");
  const [results, setResults] = useState<any[] | null>(null);

  const search = useMutation({
    mutationFn: async () =>
      apiRequest<any[]>("GET", `/api/agents/evidence?q=${encodeURIComponent(query)}`),
    onSuccess: setResults,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="w-4 h-4"/>Medical Evidence Search</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Searches PubMed (NCBI) and ClinicalTrials.gov simultaneously</p>
          <div className="flex gap-2">
            <Input data-testid="input-evidence-query" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" placeholder="e.g. sepsis guidelines 2024" />
            <Button data-testid="btn-search-evidence" onClick={() => search.mutate()} disabled={search.isPending}>
              {search.isPending ? "Searching…" : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results?.map((src: any, i: number) => (
        <Card key={i} data-testid={`card-evidence-${src.source}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4"/>
              {src.source}
              {src.count !== undefined && <Badge variant="outline" className="ml-auto">{src.count} total</Badge>}
              {src.error && <Badge className="bg-red-100 text-red-700 ml-auto">Network Error</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {src.error && <p className="text-xs text-muted-foreground">{src.error}</p>}
            {!src.error && src.items?.length === 0 && <p className="text-xs text-muted-foreground">No results found.</p>}
            <div className="divide-y">
              {src.items?.map((item: any, j: number) => (
                <div key={j} data-testid={`row-evidence-${i}-${j}`} className="py-2 text-xs">
                  <p className="font-medium">{item.title ?? item.briefTitle ?? "—"}</p>
                  <p className="text-muted-foreground">
                    {item.source ?? item.status ?? ""}
                    {item.pubdate ? ` · ${item.pubdate}` : ""}
                    {item.phase    ? ` · ${item.phase}`   : ""}
                    {item.condition ? ` · ${item.condition}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── System Health Panel ────────────────────────────────────────────────── */
function HealthPanel() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agents/health"],
    refetchInterval: 30000,
  });

  const health = data?.health ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Service Health Check</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Checking services…</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(health).map(([svc, info]: [string, any]) => (
          <Card key={svc} data-testid={`card-health-${svc}`}>
            <CardContent className="pt-4 flex items-center gap-3">
              {statusBadge(info.status)}
              <div>
                <p className="font-medium capitalize text-sm">{svc}</p>
                <p className="text-xs text-muted-foreground">{info.note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-right">Checked: {data?.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : "—"}</p>
    </div>
  );
}

/* ─── EHR Panel ──────────────────────────────────────────────────────────── */
function EHRPanel() {
  const [username, setUsername] = useState("demo");
  const [note,     setNote]     = useState("Patient presents with cough and fever. Likely viral URI. Symptomatic treatment recommended.");
  const [patientId,setPatId]    = useState("P-001");
  const [session,  setSession]  = useState<any>(null);
  const [noteRes,  setNoteRes]  = useState<any>(null);

  const { data: systems } = useQuery<any>({ queryKey: ["/api/agents/ehr/systems"] });

  const login = useMutation({
    mutationFn: () => apiRequest<any>("POST", "/api/agents/ehr/login", { username, password: "demo", system: "athena" }),
    onSuccess: setSession,
  });

  const pushNote = useMutation({
    mutationFn: () => apiRequest<any>("POST", "/api/agents/ehr/note", { note, patientId, system: "athena" }),
    onSuccess: setNoteRes,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="w-4 h-4"/>EHR Automation Agent</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Configured systems: {(systems?.configured ?? []).join(", ") || "none"}
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="mb-1 block">Username</Label>
              <Input data-testid="input-ehr-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <Button data-testid="btn-ehr-login" onClick={() => login.mutate()} disabled={login.isPending}>
              {login.isPending ? "Connecting…" : "Connect to Athena"}
            </Button>
          </div>
          {session && (
            <div className="p-2 bg-muted rounded text-xs">
              <p><strong>Session:</strong> {session.sessionId}</p>
              <p><strong>Status:</strong> {session.status} — {session.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Push Clinical Note</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1 block">Patient ID</Label>
            <Input data-testid="input-ehr-patientid" value={patientId} onChange={(e) => setPatId(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Note</Label>
            <Textarea data-testid="input-ehr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <Button data-testid="btn-ehr-note" onClick={() => pushNote.mutate()} disabled={pushNote.isPending} className="w-full">
            {pushNote.isPending ? "Pushing…" : "Push Note to EHR"}
          </Button>
          {noteRes && (
            <div className="p-2 bg-muted rounded text-xs">
              <p><strong>Note ID:</strong> {noteRes.noteId}</p>
              <p className="text-muted-foreground">{noteRes.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Context Engine Panel ───────────────────────────────────────────────── */
function ContextPanel() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/agents/context"] });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="w-4 h-4"/>System Context Engine
          {data && <Badge variant="outline" className="ml-auto">{data.totalFiles} TS files</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Scanning project…</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "Agent Files",   val: data.stats?.agentFiles   },
                { label: "Route Files",   val: data.stats?.routeFiles   },
                { label: "Service Files", val: data.stats?.serviceFiles },
                { label: "Test Files",    val: data.stats?.testFiles    },
              ].map(({ label, val }) => (
                <div key={label} className="p-2 rounded bg-muted text-center">
                  <p className="text-xl font-bold">{val}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Potentially unused files ({data.unusedCount})</p>
              <div className="max-h-32 overflow-y-auto">
                {data.unusedFiles?.length === 0
                  ? <p className="text-xs text-muted-foreground">None detected</p>
                  : data.unusedFiles?.map((f: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">{f}</p>
                  ))
                }
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Scanned: {new Date(data.scannedAt).toLocaleTimeString()}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function AgentSystemPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
          <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-300"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Medical Plugin Architecture</h1>
          <p className="text-sm text-muted-foreground">
            Context Engine · Sequential Reasoner · Evidence · EHR · Plugin Registry · Health
          </p>
        </div>
        <Badge className="ml-auto bg-blue-600 text-white"><Activity className="w-3 h-3 mr-1"/>Live</Badge>
      </div>

      <Tabs defaultValue="reasoner">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="reasoner"  data-testid="tab-reasoner">Reasoner</TabsTrigger>
          <TabsTrigger value="plugins"   data-testid="tab-plugins">Plugins</TabsTrigger>
          <TabsTrigger value="evidence"  data-testid="tab-evidence">Evidence</TabsTrigger>
          <TabsTrigger value="ehr"       data-testid="tab-ehr">EHR</TabsTrigger>
          <TabsTrigger value="health"    data-testid="tab-health">Health</TabsTrigger>
          <TabsTrigger value="context"   data-testid="tab-context">Context</TabsTrigger>
        </TabsList>

        <TabsContent value="reasoner"  className="mt-4"><ReasonerPanel /></TabsContent>
        <TabsContent value="plugins"   className="mt-4"><PluginsPanel /></TabsContent>
        <TabsContent value="evidence"  className="mt-4"><EvidencePanel /></TabsContent>
        <TabsContent value="ehr"       className="mt-4"><EHRPanel /></TabsContent>
        <TabsContent value="health"    className="mt-4"><HealthPanel /></TabsContent>
        <TabsContent value="context"   className="mt-4"><ContextPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
