import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Shield, Activity, FileText, Cpu, History, Search, Lock } from "lucide-react";

const AUTH_TOKEN = () => localStorage.getItem("app_auth_token");

async function apiFetch(url: string) {
  const token = AUTH_TOKEN();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

interface RedFlag { id: string; description: string; identifiedAt: string; identifiedBy: string; source: string; }
interface DiffItem { diagnosis: string; likelihood: number; evidenceQuality: string; supportingFindings: string[]; refutingFindings: string[]; }
interface Disposition { type: string; rationale: string; blockers: string[]; }
interface Artifact { id: string; type: string; producedBy: string; producedAt: string; consumedBy: string[]; estimatedTokens: number; payload: unknown; }
interface CompactionEvent { step: number; beforeTokens: number; afterTokens: number; artifactsEmitted: number; occurredAt: string; }

const ARTIFACT_TYPE_COLOR: Record<string, string> = {
  validated_finding:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ruled_out:          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  decision:           "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  calculation:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  uncertainty:        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  failed_attempt:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  kb_retrieval:       "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  compaction_summary: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const ROLE_LABELS = ["triage", "differential", "disposition", "billing", "supervisor"] as const;

export function ContextInspector() {
  const [encounterId, setEncounterId] = useState("");
  const [committed,   setCommitted]   = useState("");
  const [previewRole, setPreviewRole] = useState<string | null>(null);

  const stateQ = useQuery({
    queryKey: ["/api/context/state", committed],
    queryFn:  () => apiFetch(`/api/context/${committed}/state`),
    enabled:  !!committed,
    retry: false,
  });

  const compactionQ = useQuery({
    queryKey: ["/api/context/compaction", committed],
    queryFn:  () => apiFetch(`/api/context/${committed}/compaction-history`),
    enabled:  !!committed,
    retry: false,
  });

  const promptQ = useQuery({
    queryKey: ["/api/context/prompt", committed, previewRole],
    queryFn:  () => apiFetch(`/api/context/${committed}/prompts/${previewRole}`),
    enabled:  !!committed && !!previewRole,
    retry: false,
  });

  const cachedQ = useQuery({
    queryKey: ["/api/context/cached-encounters"],
    queryFn:  () => apiFetch("/api/context/cached-encounters"),
    refetchInterval: 10_000,
  });

  function submit() {
    if (encounterId.trim()) setCommitted(encounterId.trim());
  }

  const state = stateQ.data;
  const isLoading = stateQ.isLoading;
  const hasError  = stateQ.isError;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2 items-center">
        <Input
          data-testid="input-encounter-id"
          placeholder="Enter encounter ID (e.g. enc_2026_05_16_abc123)"
          value={encounterId}
          onChange={(e) => setEncounterId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="max-w-md font-mono text-sm"
        />
        <Button data-testid="btn-load-context" onClick={submit} disabled={!encounterId.trim()}>
          <Search className="h-4 w-4 mr-1" /> Load Context
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Read-only — all writes go through the pipeline
        </div>
      </div>

      {/* Cached encounters quick-pick */}
      {cachedQ.data?.encounters?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground">Recent:</span>
          {cachedQ.data.encounters.slice(0, 8).map((e: { encounterId: string; step: number; redFlags: number }) => (
            <button
              key={e.encounterId}
              data-testid={`btn-quick-pick-${e.encounterId}`}
              className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors font-mono"
              onClick={() => { setEncounterId(e.encounterId); setCommitted(e.encounterId); }}
            >
              {e.encounterId.slice(-12)}
              {e.redFlags > 0 && <span className="ml-1 text-red-500">⚠{e.redFlags}</span>}
            </button>
          ))}
        </div>
      )}

      {!committed && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
          Enter an encounter ID above to inspect its context state
        </div>
      )}

      {committed && isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Activity className="h-4 w-4 animate-pulse" /> Loading context…
        </div>
      )}

      {committed && hasError && (
        <div className="flex items-center gap-2 text-destructive border border-destructive/30 rounded-lg p-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Encounter context not found. Run the pipeline for this encounter first.</span>
        </div>
      )}

      {state && (
        <Tabs defaultValue="immutables" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="immutables" data-testid="ctx-tab-immutables">
              <Shield className="h-3.5 w-3.5 mr-1" /> Immutables
            </TabsTrigger>
            <TabsTrigger value="working" data-testid="ctx-tab-working">
              <Activity className="h-3.5 w-3.5 mr-1" /> Working
            </TabsTrigger>
            <TabsTrigger value="artifacts" data-testid="ctx-tab-artifacts">
              <FileText className="h-3.5 w-3.5 mr-1" /> Artifacts ({state.artifacts?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="prompts" data-testid="ctx-tab-prompts">
              <Cpu className="h-3.5 w-3.5 mr-1" /> Prompt Preview
            </TabsTrigger>
            <TabsTrigger value="compaction" data-testid="ctx-tab-compaction">
              <History className="h-3.5 w-3.5 mr-1" /> Compaction
            </TabsTrigger>
          </TabsList>

          {/* ── Immutables ── */}
          <TabsContent value="immutables" className="mt-3 space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  Clinical Immutables — permanent for this encounter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Chief Complaint</p>
                    <p className="font-medium" data-testid="ctx-chief-complaint">{state.immutables?.chiefComplaint}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Patient</p>
                    <p className="font-medium">
                      {state.immutables?.patient?.ageYears}y {state.immutables?.patient?.sex}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Allergies</p>
                    <p>{state.immutables?.patient?.allergies?.join(", ") || "NKDA"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Meds</p>
                    <p>{state.immutables?.patient?.currentMedications?.join(", ") || "none"}</p>
                  </div>
                </div>

                {state.immutables?.presentingVitals && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Presenting Vitals</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(state.immutables.presentingVitals)
                          .filter(([k]) => k !== "capturedAt")
                          .map(([k, v]) => (
                            <span key={k} className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                              {k.toUpperCase()} {String(v)}
                            </span>
                          ))}
                      </div>
                    </div>
                  </>
                )}

                {state.immutables?.redFlagsIdentified?.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Red Flags (permanent)
                      </p>
                      {state.immutables.redFlagsIdentified.map((rf: RedFlag) => (
                        <div key={rf.id} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded mb-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-red-700 dark:text-red-300">{rf.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Source: {rf.source} · By: {rf.identifiedBy}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {state.immutables?.hardConstraints?.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Hard Constraints</p>
                      {state.immutables.hardConstraints.map((c: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/20 rounded mb-1">
                          <Lock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          <p className="text-sm">{c}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Working Context ── */}
          <TabsContent value="working" className="mt-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">Step {state.working?.step}</Badge>
              <Badge variant="outline">Agent: {state.working?.currentAgent}</Badge>
              <Badge variant="outline">~{state.working?.estimatedTokens?.toLocaleString()} tokens</Badge>
            </div>

            {state.working?.currentDifferential?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Current Differential ({state.working.currentDifferential.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {state.working.currentDifferential.map((d: DiffItem, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded border">
                      <div className="w-12 text-right font-mono text-xs text-muted-foreground">
                        {(d.likelihood * 100).toFixed(0)}%
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{d.diagnosis}</p>
                        <p className="text-xs text-muted-foreground">
                          +: {d.supportingFindings?.join(", ") || "—"} &nbsp;
                          −: {d.refutingFindings?.join(", ") || "—"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">{d.evidenceQuality}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {state.working?.candidateDispositions?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Candidate Dispositions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {state.working.candidateDispositions.map((d: Disposition, i: number) => (
                    <div key={i} className="p-2 rounded border text-sm">
                      <Badge className="mb-1">{d.type.replace(/_/g, " ")}</Badge>
                      <p className="text-xs mt-1">{d.rationale}</p>
                      {d.blockers?.length > 0 && (
                        <p className="text-xs text-destructive mt-0.5">
                          Blockers: {d.blockers.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {state.working?.answeredQuestionsCount > 0 && (
              <p className="text-xs text-muted-foreground pl-1">
                {state.working.answeredQuestionsCount} answered question(s) in working context
              </p>
            )}
          </TabsContent>

          {/* ── Artifacts ── */}
          <TabsContent value="artifacts" className="mt-3">
            <ScrollArea className="h-[480px] pr-2">
              <div className="space-y-2">
                {state.artifacts?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No artifacts yet for this encounter.</p>
                )}
                {state.artifacts?.map((a: Artifact) => (
                  <Card key={a.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <Badge className={`text-xs shrink-0 ${ARTIFACT_TYPE_COLOR[a.type] ?? ""}`}>
                          {a.type.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground flex-1 truncate">{a.id}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{a.estimatedTokens}t</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5">
                        <span>By: <b>{a.producedBy}</b></span>
                        <span>At: {new Date(a.producedAt).toLocaleTimeString()}</span>
                        {a.consumedBy?.length > 0 && <span>Read by: {a.consumedBy.join(", ")}</span>}
                      </div>
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-24">
                        {JSON.stringify(a.payload, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Prompt Preview ── */}
          <TabsContent value="prompts" className="mt-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {ROLE_LABELS.map((role) => (
                <Button
                  key={role}
                  size="sm"
                  variant={previewRole === role ? "default" : "outline"}
                  data-testid={`btn-preview-role-${role}`}
                  onClick={() => setPreviewRole(role)}
                >
                  {role}
                </Button>
              ))}
            </div>

            {previewRole && promptQ.isLoading && (
              <p className="text-sm text-muted-foreground">Assembling prompt…</p>
            )}

            {promptQ.data && (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap items-center">
                  <Badge variant="outline">~{promptQ.data.estimatedTokens?.toLocaleString()} tokens</Badge>
                  <Badge variant="outline">Tools: {promptQ.data.toolNames?.join(", ") || "none"}</Badge>
                  {promptQ.data.excluded?.artifactIds?.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {promptQ.data.excluded.artifactIds.length} artifacts excluded (budget)
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">System Prompt</p>
                  <ScrollArea className="h-28">
                    <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap">{promptQ.data.systemPrompt}</pre>
                  </ScrollArea>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">User Prompt (assembled)</p>
                  <ScrollArea className="h-64">
                    <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap">{promptQ.data.userPrompt}</pre>
                  </ScrollArea>
                </div>
              </div>
            )}

            {!previewRole && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a role above to preview the prompt that would be assembled for that agent
              </p>
            )}
          </TabsContent>

          {/* ── Compaction History ── */}
          <TabsContent value="compaction" className="mt-3 space-y-3">
            {compactionQ.data?.events?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No compaction events for this encounter yet.
              </div>
            )}
            {compactionQ.data?.events?.map((evt: CompactionEvent, i: number) => (
              <Card key={i}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="shrink-0">Step {evt.step}</Badge>
                    <div className="flex-1 text-sm">
                      <span className="text-muted-foreground">{evt.beforeTokens.toLocaleString()} tokens</span>
                      {" → "}
                      <span className="font-medium">{evt.afterTokens.toLocaleString()} tokens</span>
                      <span className="text-muted-foreground ml-2">
                        (−{(evt.beforeTokens - evt.afterTokens).toLocaleString()})
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      +{evt.artifactsEmitted} artifacts emitted
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(evt.occurredAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
