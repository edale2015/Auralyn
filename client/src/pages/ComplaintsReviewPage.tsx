import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Stethoscope, Search, ChevronLeft, ChevronRight, ExternalLink,
  AlertTriangle, CheckCircle2, Minus, BarChart3, Filter,
  Database, RefreshCw, ArrowUpDown,
} from "lucide-react";

const SYSTEMS = [
  "All Systems",
  "Cardiovascular", "Pulmonology", "GI", "ENT", "OB/Gyn", "GU/Urology",
  "Neurology", "MSK/Ortho", "Dermatology", "Endocrine/Metabolic",
  "Allergy/Immunology", "Ophthalmology", "Infectious Disease",
  "Environmental", "Occupational/Industrial", "Toxicology",
  "Psychiatry", "Trauma/Emergency", "Wound/Burns", "Pediatrics",
  "Hematology", "Vascular", "Weight/Nutrition", "General", "Other",
];

const PAGE_SIZE = 50;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function completenessColor(dxCount: number, rfCount: number, ruleCount: number) {
  if (dxCount >= 3 && rfCount >= 2) return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  if (dxCount >= 1 || rfCount >= 1 || ruleCount >= 3) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
  return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
}

function CompletenessBadge({ dxCount, rfCount }: { dxCount: number; rfCount: number }) {
  if (dxCount >= 3 && rfCount >= 2)
    return <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400"><CheckCircle2 className="h-3 w-3" />Full</span>;
  if (dxCount >= 1 || rfCount >= 1)
    return <span className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400"><Minus className="h-3 w-3" />Partial</span>;
  return <span className="flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400"><AlertTriangle className="h-3 w-3" />Sparse</span>;
}

const SYSTEM_COLORS: Record<string, string> = {
  "Cardiovascular":       "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "Pulmonology":          "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "GI":                   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "ENT":                  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "OB/Gyn":               "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "GU/Urology":           "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Neurology":            "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "MSK/Ortho":            "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
  "Dermatology":          "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "Endocrine/Metabolic":  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "Allergy/Immunology":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Ophthalmology":        "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "Infectious Disease":   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  "Environmental":        "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Occupational/Industrial": "bg-stone-100 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300",
  "Toxicology":           "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "Psychiatry":           "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Trauma/Emergency":     "bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  "Wound/Burns":          "bg-orange-200 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  "Pediatrics":           "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300",
  "Hematology":           "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "Vascular":             "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  "Weight/Nutrition":     "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200",
  "General":              "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  "Other":                "bg-muted text-muted-foreground",
};

type SortKey = "label" | "system" | "dxCount" | "rfCount" | "ruleCount";

export default function ComplaintsReviewPage() {
  const [, navigate] = useLocation();
  const [search, setSearch]             = useState("");
  const [system, setSystem]             = useState("All Systems");
  const [completeness, setCompleteness] = useState("all");
  const [page, setPage]                 = useState(1);
  const [sortKey, setSortKey]           = useState<SortKey>("label");
  const [sortAsc, setSortAsc]           = useState(true);

  const { data: complaints = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/encounter-configs", "review-full"],
    queryFn: async () => {
      const res = await fetch("/api/encounter-configs?full=true", {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const full    = complaints.filter(c => c.dxCount >= 3 && c.rfCount >= 2).length;
    const partial = complaints.filter(c => (c.dxCount >= 1 || c.rfCount >= 1) && !(c.dxCount >= 3 && c.rfCount >= 2)).length;
    const sparse  = complaints.filter(c => c.dxCount === 0 && c.rfCount === 0).length;
    const systems = new Set(complaints.map(c => c.system)).size;
    return { total: complaints.length, full, partial, sparse, systems };
  }, [complaints]);

  const filtered = useMemo(() => {
    let result = [...complaints];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.system ?? "").toLowerCase().includes(q)
      );
    }
    if (system !== "All Systems") result = result.filter(c => c.system === system);
    if (completeness === "full")    result = result.filter(c => c.dxCount >= 3 && c.rfCount >= 2);
    if (completeness === "partial") result = result.filter(c => (c.dxCount >= 1 || c.rfCount >= 1) && !(c.dxCount >= 3 && c.rfCount >= 2));
    if (completeness === "sparse")  result = result.filter(c => c.dxCount === 0 && c.rfCount === 0);

    result.sort((a, b) => {
      let av: any = a[sortKey] ?? "";
      let bv: any = b[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [complaints, search, system, completeness, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
  }

  function openInSimulator(id: string) {
    navigate(`/encounter?c=${encodeURIComponent(id)}`);
  }

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className="flex items-center gap-0.5 hover:text-foreground"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ml-0.5 ${sortKey === col ? "text-blue-500" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <Database className="h-5 w-5 text-blue-600 shrink-0" />
        <div>
          <h1 className="text-base font-bold leading-tight" data-testid="heading-complaints-review">
            Complaints Review
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Full KB catalog — review, filter, and open any complaint in the simulator
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5"
            data-testid="button-refresh-complaints"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="flex items-center gap-6 px-6 py-2.5 border-b bg-muted/30 text-sm flex-wrap">
          <span className="font-bold text-foreground flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            {stats.total.toLocaleString()} total complaints
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {stats.full} full
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Minus className="h-3.5 w-3.5" />
            {stats.partial} partial
          </span>
          <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats.sparse} sparse
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{stats.systems} systems</span>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-background flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            data-testid="input-complaint-review-search"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or ID…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={system} onValueChange={v => { setSystem(v); setPage(1); }}>
          <SelectTrigger data-testid="select-system-filter" className="h-8 text-xs w-52">
            <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYSTEMS.map(s => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={completeness} onValueChange={v => { setCompleteness(v); setPage(1); }}>
          <SelectTrigger data-testid="select-completeness-filter" className="h-8 text-xs w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all"     className="text-xs">All completeness</SelectItem>
            <SelectItem value="full"    className="text-xs">✓ Full</SelectItem>
            <SelectItem value="partial" className="text-xs">⊖ Partial</SelectItem>
            <SelectItem value="sparse"  className="text-xs">⚠ Sparse</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} matching · page {page}/{totalPages || 1}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading all complaints from KB…</span>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground sticky top-0">
                <th className="px-4 py-2 text-left font-semibold w-8">#</th>
                <th className="px-4 py-2 text-left font-semibold">
                  <SortBtn col="label" label="Complaint" />
                </th>
                <th className="px-4 py-2 text-left font-semibold">
                  <SortBtn col="system" label="System" />
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  <SortBtn col="dxCount" label="Dx" />
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  <SortBtn col="rfCount" label="RF" />
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  <SortBtn col="ruleCount" label="Rules" />
                </th>
                <th className="px-3 py-2 text-center font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-muted-foreground text-sm">
                    No complaints match the current filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((c, i) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + i + 1;
                  const rowCls = completenessColor(c.dxCount, c.rfCount, c.ruleCount);
                  return (
                    <tr
                      key={c.id}
                      data-testid={`row-complaint-${c.id}`}
                      className={`border-b transition-colors hover:bg-muted/40 cursor-pointer ${rowCls}`}
                      onClick={() => openInSimulator(c.id)}
                    >
                      <td className="px-4 py-2 text-muted-foreground text-xs tabular-nums">{globalIdx}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-sm leading-tight">{c.label}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{c.id}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SYSTEM_COLORS[c.system] ?? SYSTEM_COLORS["Other"]}`}>
                          {c.system}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-mono font-semibold ${c.dxCount >= 3 ? "text-green-600 dark:text-green-400" : c.dxCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-400"}`}>
                          {c.dxCount}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-mono font-semibold ${c.rfCount >= 2 ? "text-green-600 dark:text-green-400" : c.rfCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-400"}`}>
                          {c.rfCount}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs font-mono text-muted-foreground">{c.ruleCount}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <CompletenessBadge dxCount={c.dxCount} rfCount={c.rfCount} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          data-testid={`button-open-simulator-${c.id}`}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-blue-600 hover:text-blue-700"
                          onClick={e => { e.stopPropagation(); openInSimulator(c.id); }}
                        >
                          <Stethoscope className="h-3 w-3" />
                          Simulate
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t bg-card/80 sticky bottom-0">
          <span className="text-xs text-muted-foreground">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(1)}
              disabled={page === 1}
              data-testid="button-page-first"
            >«</Button>
            <Button
              variant="outline" size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="button-page-prev"
            ><ChevronLeft className="h-3.5 w-3.5" /></Button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <Button
                  key={p} variant={p === page ? "default" : "outline"}
                  size="sm" className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(p)}
                  data-testid={`button-page-${p}`}
                >{p}</Button>
              );
            })}
            <Button
              variant="outline" size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              data-testid="button-page-next"
            ><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button
              variant="outline" size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              data-testid="button-page-last"
            >»</Button>
          </div>
        </div>
      )}
    </div>
  );
}
