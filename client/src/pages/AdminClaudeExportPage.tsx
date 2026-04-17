import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Download, Package, Clock, FileText, Layers,
  ShieldCheck, RefreshCw, CheckCircle, AlertTriangle,
  ChevronRight, Archive
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExportResult {
  ok:           boolean;
  exportDir?:   string;
  zipPath?:     string;
  sliceCount?:  number;
  fileCount?:   number;
  skippedCount?: number;
  downloadUrl?: string;
  error?:       string;
}

interface ExportListItem {
  id:          string;
  exportDir:   string;
  zipExists:   boolean;
  sizeBytes:   number;
  downloadUrl: string | null;
}

// ── Slice descriptions ────────────────────────────────────────────────────────

const SLICES = [
  { id: "01", label: "System Overview",              desc: "Clinical pipeline + orchestration" },
  { id: "02", label: "Diagnosis Engine",             desc: "Bayesian + Fisher + natural gradient" },
  { id: "03", label: "Disposition & Safety Core",    desc: "MOST CRITICAL — under-triage risk" },
  { id: "04", label: "Validation Discipline",        desc: "Golden cases, adversarial, calibration" },
  { id: "05", label: "Control Tower & Streaming",    desc: "WebSocket, real-time patient monitoring" },
  { id: "06", label: "Digital Twin & Simulation",    desc: "Synthetic cases, deterioration engine" },
  { id: "07", label: "Clinical RAG Copilot",         desc: "KB-grounded answers — must not leak to disposition" },
  { id: "08", label: "RLHF & Safe Learning",         desc: "Weight updates, drift risk, physician gating" },
  { id: "09", label: "FDA & Audit Layer",            desc: "21 CFR Part 11/820 traceability" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024)       return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function exportTimestamp(id: string) {
  return id.replace("T", " ").replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ".$3Z").slice(0, 19).replace("T", " ");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminClaudeExportPage() {
  const { toast } = useToast();

  const [diffOnly,     setDiffOnly]     = useState(false);
  const [scrubSecrets, setScrubSecrets] = useState(true);
  const [scrubPHI,     setScrubPHI]     = useState(true);
  const [lastResult,   setLastResult]   = useState<ExportResult | null>(null);

  const exportList = useQuery<{ ok: boolean; exports: ExportListItem[] }>({
    queryKey: ["/api/admin/claude-export/list"],
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/export-claude-slices", {
        diffOnly,
        scrubSecrets,
        scrubPHI,
      }),
    onSuccess: async (res) => {
      const data: ExportResult = await res.json();
      setLastResult(data);
      if (data.ok) {
        toast({ title: "Export complete", description: `${data.sliceCount} slices, ${data.fileCount} files included.` });
        exportList.refetch();
      } else {
        toast({ title: "Export failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Export error", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-violet-400" />
          Claude Review Slice Exporter
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Package Auralyn code into structured slices for systematic Claude safety review.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left — controls */}
        <div className="space-y-4">
          {/* Export options */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200">Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-slate-300">Diff-only export</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Skip files unchanged since last export</p>
                </div>
                <Switch
                  data-testid="switch-diff-only"
                  checked={diffOnly}
                  onCheckedChange={setDiffOnly}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-slate-300">Scrub secrets</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Redact process.env.* and inline keys</p>
                </div>
                <Switch
                  data-testid="switch-scrub-secrets"
                  checked={scrubSecrets}
                  onCheckedChange={setScrubSecrets}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-slate-300">Scrub PHI</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Redact SSN, DOB, MRN, phone numbers</p>
                </div>
                <Switch
                  data-testid="switch-scrub-phi"
                  checked={scrubPHI}
                  onCheckedChange={setScrubPHI}
                />
              </div>

              <Button
                data-testid="button-run-export"
                className="w-full bg-violet-700 hover:bg-violet-800 text-white"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                {exportMutation.isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Exporting…</>
                  : <><Package className="w-3.5 h-3.5 mr-2" />Generate Export</>}
              </Button>
            </CardContent>
          </Card>

          {/* Last result */}
          {lastResult && (
            <Card className={`border ${lastResult.ok ? "bg-slate-900 border-emerald-900" : "bg-slate-900 border-red-900"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  {lastResult.ok
                    ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                    : <AlertTriangle className="w-4 h-4 text-red-400" />}
                  {lastResult.ok ? "Export Complete" : "Export Failed"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {lastResult.ok ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Slices</span>
                      <span className="text-slate-200">{lastResult.sliceCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Files included</span>
                      <span className="text-emerald-400 font-medium">{lastResult.fileCount}</span>
                    </div>
                    {(lastResult.skippedCount ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Skipped (unchanged)</span>
                        <span className="text-slate-500">{lastResult.skippedCount}</span>
                      </div>
                    )}
                    {lastResult.downloadUrl && (
                      <a
                        data-testid="link-download-zip"
                        href={lastResult.downloadUrl}
                        download
                        className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-violet-900 hover:bg-violet-800 text-violet-200 rounded text-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download ZIP
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-red-400">{lastResult.error}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Safety notes */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" /> Safety Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {[
                { label: "Allowlist", desc: "Only server/ai, server/clinical, server/validation, etc." },
                { label: "Secret scrubber", desc: "Redacts process.env.* and inline API keys" },
                { label: "PHI scrubber", desc: "Redacts SSN, DOB, MRN, phone numbers" },
                { label: "Path traversal guard", desc: "Download limited to exports/ directory" },
                { label: "Admin-only", desc: "Requires physician + admin role JWT" },
              ].map(({ label, desc }) => (
                <div key={label} className="flex items-start gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-slate-300 font-medium">{label}</span>
                    <span className="text-slate-500"> — {desc}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Middle — slice map */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" /> 9 Review Slices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px] px-4 pb-4">
              {SLICES.map((s, i) => (
                <div
                  key={s.id}
                  data-testid={`slice-card-${s.id}`}
                  className="flex items-start gap-3 py-3 border-b border-slate-800 last:border-0"
                >
                  <span className="text-xs font-mono text-slate-600 w-6 pt-0.5 shrink-0">{s.id}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200">{s.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                  </div>
                  {i === 2 && (
                    <Badge className="bg-red-900 text-red-200 text-xs shrink-0">CRITICAL</Badge>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0 mt-0.5" />
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right — export history */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> Export History
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-slate-400 hover:text-slate-200"
                data-testid="button-refresh-history"
                onClick={() => exportList.refetch()}
              >
                <RefreshCw className={`w-3 h-3 ${exportList.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px] px-4 pb-4">
              {exportList.isLoading && (
                <p className="text-xs text-slate-500 py-4 text-center">Loading…</p>
              )}
              {(exportList.data?.exports ?? []).length === 0 && !exportList.isLoading && (
                <div className="text-center py-12 text-slate-600">
                  <Archive className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No exports yet</p>
                  <p className="text-xs mt-1">Run your first export to see it here</p>
                </div>
              )}
              {(exportList.data?.exports ?? []).map((e: ExportListItem) => (
                <div
                  key={e.id}
                  data-testid={`export-history-${e.id}`}
                  className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0"
                >
                  <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 font-mono truncate">
                      {exportTimestamp(e.id)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {e.zipExists ? formatBytes(e.sizeBytes) : "zip missing"}
                    </p>
                  </div>
                  {e.downloadUrl && (
                    <a
                      data-testid={`link-download-${e.id}`}
                      href={e.downloadUrl}
                      download
                      className="text-violet-400 hover:text-violet-300 shrink-0"
                      title="Download ZIP"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* How-to footer */}
      <Card className="bg-slate-900 border-slate-800 mt-4">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-slate-300 mb-2">How to use the export:</p>
          <ol className="space-y-1">
            {[
              "Click Generate Export — the system packages 9 markdown slices + a ZIP archive.",
              "Download the ZIP and open each numbered .md file.",
              "Send each slice to Claude separately (300–800 lines per message is ideal).",
              "After each slice, ask: \"List the TOP 5 MOST DANGEROUS FAILURE MODES.\"",
              "After all 9 slices, send the Final Meta Prompt from REVIEW_PROMPTS.md.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-slate-600 w-4 shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
