import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  BookOpen, Search, CheckCircle, XCircle, GitBranch, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Sparkles, ShieldCheck,
  ExternalLink, Play, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Article = {
  id: number; title: string; url: string; author?: string;
  publishedAt?: string; excerpt?: string; tags?: string[];
  source: string; createdAt: string;
};
type Review = {
  relevanceScore: number; trustScore: number; noveltyScore: number;
  actionabilityScore: number; verdict: string; reasons: string[];
};
type Summary = { summary: string; takeaways: string[] };
type Upgrade = {
  id: number; articleId: number; title: string; rationale: string;
  affectedFiles: string[]; validationPlan: string[];
  validationStatus: string; approved: boolean; approvedBy?: string;
};
type GithubExport = { id: number; branchName: string; prNumber?: number; prUrl?: string; status: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    adopt:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    test_only: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    ignore:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    passed:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    failed:    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    pending:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    rejected:  "bg-red-100 text-red-800",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[verdict] ?? "bg-slate-100 text-slate-600"}`}>
      {verdict.replace("_", " ").toUpperCase()}
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right font-mono">{value}</span>
    </div>
  );
}

// ── Article Detail Panel ──────────────────────────────────────────────────────

function ArticleDetail({ article, onClose }: { article: Article; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const detail = useQuery({
    queryKey: ["/api/research/articles", article.id],
    queryFn:  () => apiRequest(`/api/research/articles/${article.id}`).then(r => r.json()),
  });

  const d: { article: Article; review?: Review; summary?: Summary; upgrades?: Upgrade[] } = detail.data ?? { article };

  const mutate = (path: string, body?: any, key?: string) =>
    apiRequest(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) throw new Error(data.error ?? "Request failed");
        qc.invalidateQueries({ queryKey: ["/api/research/articles", article.id] });
        if (key) qc.invalidateQueries({ queryKey: [key] });
        toast({ title: "Done", description: "Action completed successfully" });
        return data;
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }));

  const triage   = useMutation({ mutationFn: () => mutate(`/api/research/triage/${article.id}`, undefined, "/api/research/articles") });
  const summarize = useMutation({ mutationFn: () => mutate(`/api/research/summary/${article.id}`) });
  const propose  = useMutation({ mutationFn: () => mutate(`/api/research/propose/${article.id}`) });

  const upgrade  = d.upgrades?.[0];

  const validate = useMutation({
    mutationFn: () => upgrade ? mutate(`/api/research/validate/${upgrade.id}`) : Promise.resolve(),
  });
  const approve = useMutation({
    mutationFn: () => upgrade ? mutate(`/api/research/approve/${upgrade.id}`, { approvedBy: "physician-review" }) : Promise.resolve(),
  });
  const reject = useMutation({
    mutationFn: () => upgrade ? mutate(`/api/research/reject/${upgrade.id}`, { rejectedBy: "physician-review", reason: "Manual rejection" }) : Promise.resolve(),
  });
  const exportGh = useMutation({
    mutationFn: () => upgrade ? mutate(`/api/research/export-github/${upgrade.id}`) : Promise.resolve(),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">{article.source}</Badge>
              {d.review && <VerdictBadge verdict={d.review.verdict} />}
            </div>
            <h2 className="font-bold text-base leading-snug">{article.title}</h2>
            {article.author && <p className="text-xs text-muted-foreground mt-0.5">by {article.author}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">

          {/* Pipeline action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => triage.mutate()} disabled={triage.isPending || !!d.review} data-testid="button-triage">
              {triage.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
              {d.review ? "Triaged" : "Triage"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => summarize.mutate()} disabled={summarize.isPending || !!d.summary} data-testid="button-summarize">
              {summarize.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <BookOpen className="w-3 h-3 mr-1" />}
              {d.summary ? "Summarized" : "Summarize"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => propose.mutate()} disabled={propose.isPending || !!upgrade} data-testid="button-propose">
              {propose.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              {upgrade ? "Proposed" : "Propose Upgrade"}
            </Button>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost"><ExternalLink className="w-3 h-3 mr-1" />Read Article</Button>
            </a>
          </div>

          {/* Triage scores */}
          {d.review && (
            <div className="space-y-2 p-3 bg-muted/40 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Triage Scores</p>
              <ScoreBar label="Relevance"     value={d.review.relevanceScore} />
              <ScoreBar label="Trust"         value={d.review.trustScore} />
              <ScoreBar label="Novelty"       value={d.review.noveltyScore} />
              <ScoreBar label="Actionability" value={d.review.actionabilityScore} />
              <ul className="mt-2 space-y-0.5">
                {d.review.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1"><span>·</span>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {d.summary && (
            <div className="space-y-2 p-3 bg-muted/40 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Summary</p>
              <p className="text-sm leading-relaxed">{d.summary.summary}</p>
              <ul className="mt-2 space-y-1">
                {(d.summary.takeaways ?? []).map((t, i) => (
                  <li key={i} className="text-xs flex gap-1.5"><span className="text-emerald-500 font-bold">{i + 1}.</span>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Proposed upgrade */}
          {upgrade && (
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proposed Upgrade</p>
                <VerdictBadge verdict={upgrade.validationStatus} />
              </div>
              <p className="font-semibold text-sm">{upgrade.title}</p>
              <p className="text-xs text-muted-foreground">{upgrade.rationale}</p>

              <div>
                <p className="text-xs font-medium mb-1">Affected files:</p>
                {upgrade.affectedFiles.map((f, i) => (
                  <code key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded block mb-0.5">{f}</code>
                ))}
              </div>

              <div>
                <p className="text-xs font-medium mb-1">Validation plan:</p>
                {upgrade.validationPlan.map((v, i) => (
                  <p key={i} className="text-xs text-muted-foreground">· {v}</p>
                ))}
              </div>

              {/* Upgrade action pipeline */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button size="sm" variant="outline"
                  onClick={() => validate.mutate()}
                  disabled={validate.isPending || upgrade.validationStatus === "passed"}
                  data-testid="button-validate">
                  {validate.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                  {upgrade.validationStatus === "passed" ? "Validated ✓" : "Run Validation"}
                </Button>

                {upgrade.validationStatus === "passed" && !upgrade.approved && (
                  <>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => approve.mutate()} disabled={approve.isPending}
                      data-testid="button-approve-upgrade">
                      {approve.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <ThumbsUp className="w-3 h-3 mr-1" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}
                      data-testid="button-reject-upgrade">
                      <ThumbsDown className="w-3 h-3 mr-1" />Reject
                    </Button>
                  </>
                )}

                {upgrade.approved && (
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => exportGh.mutate()} disabled={exportGh.isPending}
                    data-testid="button-export-github">
                    {exportGh.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <GitBranch className="w-3 h-3 mr-1" />}
                    Export to GitHub PR
                  </Button>
                )}
              </div>

              {upgrade.approved && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle className="w-3 h-3" />Approved by {upgrade.approvedBy}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onClick }: { article: any; onClick: () => void }) {
  const verdict = article.verdict as string | undefined;
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}
      data-testid={`card-article-${article.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 flex-1">
            {article.title}
          </CardTitle>
          {verdict && <VerdictBadge verdict={verdict} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {article.author && `${article.author} · `}{article.source}
          {article.publishedAt && ` · ${new Date(article.publishedAt).toLocaleDateString()}`}
        </p>
      </CardHeader>
      {article.excerpt && (
        <CardContent className="pb-2">
          <p className="text-xs text-muted-foreground line-clamp-2">{article.excerpt}</p>
        </CardContent>
      )}
      <CardFooter className="pt-0 gap-1 flex-wrap">
        {(article.tags as string[] ?? []).slice(0, 4).map((t: string) => (
          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
        ))}
      </CardFooter>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResearchInboxPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Article | null>(null);
  const [filterVerdict, setFilterVerdict] = useState<string>("all");

  const articles = useQuery({
    queryKey: ["/api/research/articles"],
    queryFn:  () => apiRequest("/api/research/articles").then(r => r.json()),
  });

  const upgrades = useQuery({
    queryKey: ["/api/research/upgrades"],
    queryFn:  () => apiRequest("/api/research/upgrades").then(r => r.json()),
  });

  const config = useQuery({
    queryKey: ["/api/research/config"],
    queryFn:  () => apiRequest("/api/research/config").then(r => r.json()),
  });

  const scan = useMutation({
    mutationFn: () =>
      apiRequest("/api/research/scan", { method: "POST" })
        .then(r => r.json())
        .then(d => { if (!d.ok) throw new Error(d.error); return d; }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/research/articles"] });
      toast({ title: "Scan complete", description: `${d.inserted?.length ?? 0} new articles found` });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });

  const allArticles: any[] = articles.data?.articles ?? [];
  const filtered = filterVerdict === "all"
    ? allArticles
    : allArticles.filter((a: any) => a.verdict === filterVerdict || (!a.verdict && filterVerdict === "unreviewed"));

  const pendingUpgrades: Upgrade[] = (upgrades.data?.upgrades ?? []).filter((u: Upgrade) => !u.approved);
  const approvedUpgrades: Upgrade[] = (upgrades.data?.upgrades ?? []).filter((u: Upgrade) => u.approved);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-violet-500" />
            Research Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-research → auto-propose → auto-validate → human-approve → GitHub PR
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`w-1.5 h-1.5 rounded-full ${config.data?.githubConfigured ? "bg-emerald-500" : "bg-slate-400"}`} />
            GitHub {config.data?.githubConfigured ? "connected" : "not configured"}
          </div>
          <Button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            data-testid="button-scan-feeds"
          >
            {scan.isPending
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Scanning…</>
              : <><Search className="w-4 h-4 mr-2" />Scan Feeds</>}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total articles", value: allArticles.length, color: "text-blue-600" },
          { label: "Adopt",       value: allArticles.filter((a: any) => a.verdict === "adopt").length,     color: "text-emerald-600" },
          { label: "Test only",   value: allArticles.filter((a: any) => a.verdict === "test_only").length, color: "text-amber-600" },
          { label: "Pending upgrades", value: pendingUpgrades.length, color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending approval banner */}
      {pendingUpgrades.filter(u => u.validationStatus === "passed").length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {pendingUpgrades.filter(u => u.validationStatus === "passed").length} upgrade(s) passed validation and are awaiting your approval before GitHub export.
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {["all", "unreviewed", "adopt", "test_only", "ignore"].map(f => (
          <button
            key={f}
            onClick={() => setFilterVerdict(f)}
            data-testid={`filter-${f}`}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filterVerdict === f
                ? "bg-foreground text-background border-foreground"
                : "border-muted-foreground/30 text-muted-foreground hover:border-foreground/50"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Article grid */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Articles ({filtered.length})
          </h2>
          {articles.isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading articles…</div>
          )}
          {!articles.isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No articles yet</p>
              <p className="text-sm mt-1">Click "Scan Feeds" to pull the latest medical AI research</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((a: any) => (
              <ArticleCard key={a.id} article={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        </div>

        {/* Upgrade queue */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Upgrade Queue ({(upgrades.data?.upgrades ?? []).length})
          </h2>
          {(upgrades.data?.upgrades ?? []).map((u: Upgrade) => (
            <div key={u.id} className="p-3 border rounded-lg space-y-2"
              data-testid={`upgrade-card-${u.id}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-snug flex-1">{u.title}</p>
                <VerdictBadge verdict={u.approved ? "approved" : u.validationStatus} />
              </div>
              <p className="text-xs text-muted-foreground">{u.rationale.slice(0, 100)}…</p>
              <div className="flex gap-1.5 flex-wrap">
                {u.affectedFiles.slice(0, 2).map((f, i) => (
                  <code key={i} className="text-xs bg-muted px-1 py-0.5 rounded truncate max-w-[160px]">{f.split("/").pop()}</code>
                ))}
              </div>
              {u.approved && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle className="w-3 h-3" />Approved · awaiting GitHub export
                </div>
              )}
            </div>
          ))}
          {!upgrades.isLoading && (upgrades.data?.upgrades ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No proposed upgrades yet.<br/>Open an article and click "Propose Upgrade".
            </div>
          )}

          {/* GitHub setup guide */}
          {!config.data?.githubConfigured && (
            <div className="mt-4 p-4 border border-dashed rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="w-4 h-4 text-violet-500" />
                GitHub Setup Required
              </div>
              <p className="text-xs text-muted-foreground">
                To export approved upgrades as GitHub PRs, configure these environment secrets:
              </p>
              <div className="space-y-1">
                {["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BASE_BRANCH=main"].map(v => (
                  <code key={v} className="text-xs bg-muted px-2 py-0.5 rounded block">{v}</code>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Use a fine-grained PAT with <em>Contents</em> and <em>Pull Requests</em> write permissions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Article detail modal */}
      {selected && <ArticleDetail article={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
