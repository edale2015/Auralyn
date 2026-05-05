/**
 * ClinicalDecisionTree.tsx
 *
 * Renders an AI-generated, per-complaint clinical decision flowchart as an SVG.
 * Nodes: start (pill), decision (diamond), process (rectangle), action (rectangle +
 * bullets), terminal (rounded pill). Arrows with Yes/No labels on decision branches.
 *
 * Data: GET /api/master-rules/flowchart/:complaint_id
 * Backend generates the tree via GPT-4o from the complaint's KB rules, then caches it.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Info, Search, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("app_auth_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowNode {
  id:       string;
  type:     "start" | "decision" | "process" | "action" | "terminal";
  label:    string;
  detail?:  string[];
  next_id?: string;
  yes_id?:  string;
  no_id?:   string;
}

interface Flowchart {
  title:    string;
  start_id: string;
  nodes:    FlowNode[];
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const BOX_W    = 224;
const BASE_H   = 58;
const LINE_H   = 15;
const DIAM_W   = 214;
const DIAM_H   = 100;
const V_GAP    = 72;
const H_GAP    = 72;
const MARGIN_X = 90;
const MARGIN_Y = 30;

interface Pos { cx: number; y: number; nw: number; nh: number; }

function nodeH(n: FlowNode): number {
  if (n.type === "decision") return DIAM_H;
  const labelLines = Math.ceil(n.label.length / 30);
  const extra      = (n.detail?.length ?? 0) * LINE_H + Math.max(0, labelLines - 2) * LINE_H;
  return Math.max(BASE_H, BASE_H + extra);
}

function subtreeWidth(
  id: string,
  nmap: Map<string, FlowNode>,
  memo = new Map<string, number>(),
  visited = new Set<string>(),
): number {
  if (!id || !nmap.has(id) || visited.has(id)) return BOX_W;
  if (memo.has(id)) return memo.get(id)!;
  visited.add(id);
  const n = nmap.get(id)!;
  let w: number;
  if (n.type === "decision") {
    const lw = n.no_id  ? subtreeWidth(n.no_id,  nmap, memo, new Set(visited)) : BOX_W;
    const rw = n.yes_id ? subtreeWidth(n.yes_id, nmap, memo, new Set(visited)) : BOX_W;
    w = lw + H_GAP + rw;
  } else {
    const nw = n.next_id ? subtreeWidth(n.next_id, nmap, memo, new Set(visited)) : BOX_W;
    w = Math.max(BOX_W, nw);
  }
  memo.set(id, w);
  return w;
}

function buildLayout(
  id: string,
  nmap: Map<string, FlowNode>,
  positions: Map<string, Pos>,
  cx: number,
  y: number,
  wmemo: Map<string, number>,
  visited = new Set<string>(),
): number {
  if (!id || !nmap.has(id) || visited.has(id)) return y;
  visited.add(id);
  const n  = nmap.get(id)!;
  const nh = nodeH(n);
  const nw = n.type === "decision" ? DIAM_W : BOX_W;
  positions.set(id, { cx, y, nw, nh });
  const nextY = y + nh + V_GAP;

  if (n.type === "decision") {
    const lw     = n.no_id  ? subtreeWidth(n.no_id,  nmap, wmemo) : BOX_W;
    const rw     = n.yes_id ? subtreeWidth(n.yes_id, nmap, wmemo) : BOX_W;
    const total  = lw + H_GAP + rw;
    const leftCX  = cx - total / 2 + lw  / 2;
    const rightCX = cx + total / 2 - rw  / 2;
    let maxY = nextY;
    if (n.no_id)  maxY = Math.max(maxY, buildLayout(n.no_id,  nmap, positions, leftCX,  nextY, wmemo, visited));
    if (n.yes_id) maxY = Math.max(maxY, buildLayout(n.yes_id, nmap, positions, rightCX, nextY, wmemo, visited));
    return maxY;
  }
  if (n.next_id) return buildLayout(n.next_id, nmap, positions, cx, nextY, wmemo, visited);
  return nextY;
}

function computeLayout(fc: Flowchart): {
  positions: Map<string, Pos>;
  totalW: number;
  totalH: number;
} {
  const nmap  = new Map(fc.nodes.map(n => [n.id, n]));
  const wmemo = new Map<string, number>();
  const positions = new Map<string, Pos>();
  const treeW = subtreeWidth(fc.start_id, nmap, wmemo);
  const cx    = MARGIN_X + treeW / 2;
  const totalH = buildLayout(fc.start_id, nmap, positions, cx, MARGIN_Y, wmemo);
  return { positions, totalW: treeW + MARGIN_X * 2, totalH: totalH + MARGIN_Y };
}

// ─── Node colours ─────────────────────────────────────────────────────────────

const COLORS = {
  start:    { fill: "#1E3A5F", stroke: "#1E3A5F", text: "#FFFFFF", rx: 999 },
  process:  { fill: "#EFF6FF", stroke: "#3B82F6", text: "#1E40AF", rx: 6   },
  action:   { fill: "#F0FDF4", stroke: "#16A34A", text: "#14532D", rx: 6   },
  terminal: { fill: "#1F2937", stroke: "#111827", text: "#FFFFFF", rx: 999 },
};

// ─── SVG node renderers ───────────────────────────────────────────────────────

function DecisionDiamond({ pos, node, selected, onClick }: {
  pos: Pos; node: FlowNode; selected: boolean; onClick: () => void;
}) {
  const { cx, y, nw, nh } = pos;
  const hw = nw / 2, hh = nh / 2;
  const points = `${cx},${y} ${cx + hw},${y + hh} ${cx},${y + nh} ${cx - hw},${y + hh}`;
  const fill   = selected ? "#D97706" : "#F59E0B";
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <polygon points={points} fill={fill} stroke="#B45309" strokeWidth={2} />
      <foreignObject x={cx - hw + 14} y={y + 10} width={nw - 28} height={nh - 20}>
        <div
          style={{
            fontSize: 10.5, fontWeight: 700, textAlign: "center",
            color: "#1F2937", lineHeight: 1.35, wordBreak: "break-word",
          }}
        >
          {node.label}
        </div>
      </foreignObject>
    </g>
  );
}

function RectNode({ pos, node, selected, onClick }: {
  pos: Pos; node: FlowNode; selected: boolean; onClick: () => void;
}) {
  const { cx, y, nw, nh } = pos;
  const c  = COLORS[node.type as keyof typeof COLORS] ?? COLORS.process;
  const rx = c.rx;
  const isTerminal = node.type === "terminal";
  const isEscalate = isTerminal && /ER|escalat|911|HARD|STOP|immediate/i.test(node.label);

  const fill   = isEscalate ? "#7F1D1D" : selected ? "#BFDBFE" : c.fill;
  const stroke = isEscalate ? "#DC2626" : c.stroke;
  const text   = isEscalate ? "#FFFFFF" : c.text;

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        x={cx - nw / 2} y={y} width={nw} height={nh}
        rx={rx} fill={fill} stroke={stroke} strokeWidth={2}
        filter={selected ? "drop-shadow(0 0 4px #3B82F6)" : undefined}
      />
      <foreignObject x={cx - nw / 2 + 10} y={y + 8} width={nw - 20} height={nh - 16}>
        <div style={{ fontSize: 10.5, textAlign: "center", color: text, lineHeight: 1.35, wordBreak: "break-word" }}>
          <div style={{ fontWeight: 700 }}>{node.label}</div>
          {node.detail?.map((d, i) => (
            <div key={i} style={{ marginTop: 2, fontWeight: 400, textAlign: "left" }}>• {d}</div>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

// ─── Arrow renderer ───────────────────────────────────────────────────────────

function Arrow({
  from, to, label, fromBottom = true,
}: {
  from: Pos; to: Pos; label?: string; fromBottom?: boolean;
}) {
  // From-point: bottom-center of parent
  const x1 = from.cx;
  const y1 = from.y + (fromBottom ? from.nh : from.nh / 2);
  // To-point: top-center of child
  const x2 = to.cx;
  const y2 = to.y;

  const midY = (y1 + y2) / 2;
  const straight = Math.abs(x1 - x2) < 4;
  let d: string;
  if (straight) {
    d = `M ${x1} ${y1} L ${x2} ${y2 - 7}`;
  } else {
    d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2 - 7}`;
  }

  const isRed = label?.toLowerCase() === "yes";
  const lineColor = isRed ? "#059669" : "#6B7280";
  const labelColor = isRed ? "#065F46" : "#4B5563";

  // Label position: on the horizontal segment (or near the arrow start)
  const labelX = straight ? x1 + 6 : (x1 + x2) / 2;
  const labelY = straight ? (y1 + y2) / 2 : midY - 5;

  return (
    <g>
      <path d={d} stroke={lineColor} strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" />
      {label && (
        <text x={labelX} y={labelY} fontSize={9.5} fontWeight={700} fill={labelColor} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Collect edges from the flowchart ────────────────────────────────────────

interface Edge {
  fromId: string;
  toId:   string;
  label?: string;
}

function collectEdges(fc: Flowchart): Edge[] {
  const edges: Edge[] = [];
  for (const n of fc.nodes) {
    if (n.next_id) edges.push({ fromId: n.id, toId: n.next_id });
    if (n.yes_id)  edges.push({ fromId: n.id, toId: n.yes_id, label: "Yes" });
    if (n.no_id)   edges.push({ fromId: n.id, toId: n.no_id,  label: "No"  });
  }
  return edges;
}

// ─── Full SVG flowchart ───────────────────────────────────────────────────────

function FlowchartSVG({ fc }: { fc: Flowchart }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { positions, totalW, totalH } = useMemo(() => computeLayout(fc), [fc]);
  const nmap  = useMemo(() => new Map(fc.nodes.map(n => [n.id, n])), [fc]);
  const edges = useMemo(() => collectEdges(fc), [fc]);

  const selectedNode = selectedId ? nmap.get(selectedId) : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto overflow-y-auto max-h-[720px] border rounded-xl bg-white dark:bg-slate-950 shadow-inner">
        <svg
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          style={{ display: "block", minWidth: totalW }}
        >
          <defs>
            <marker
              id="arrowhead" markerWidth={8} markerHeight={6}
              refX={7} refY={3} orient="auto" markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#6B7280" />
            </marker>
          </defs>

          {/* Arrows first (behind nodes) */}
          {edges.map((e, i) => {
            const fp = positions.get(e.fromId);
            const tp = positions.get(e.toId);
            if (!fp || !tp) return null;
            return <Arrow key={i} from={fp} to={tp} label={e.label} />;
          })}

          {/* Nodes */}
          {fc.nodes.map(n => {
            const pos = positions.get(n.id);
            if (!pos) return null;
            const sel = selectedId === n.id;
            if (n.type === "decision") {
              return (
                <DecisionDiamond
                  key={n.id} pos={pos} node={n} selected={sel}
                  onClick={() => setSelectedId(sel ? null : n.id)}
                />
              );
            }
            return (
              <RectNode
                key={n.id} pos={pos} node={n} selected={sel}
                onClick={() => setSelectedId(sel ? null : n.id)}
              />
            );
          })}
        </svg>
      </div>

      {/* Selected node detail panel */}
      {selectedNode && (
        <div className="border rounded-lg p-3 bg-card text-xs space-y-1.5 animate-in slide-in-from-bottom-2">
          <div className="font-bold text-sm">{selectedNode.label}</div>
          <div className="flex items-center gap-2">
            <Badge className={{
              start:    "bg-slate-700 text-white",
              decision: "bg-amber-500 text-black",
              process:  "bg-blue-100 text-blue-800",
              action:   "bg-green-100 text-green-800",
              terminal: "bg-slate-800 text-white",
            }[selectedNode.type] ?? ""}>{selectedNode.type}</Badge>
            <span className="text-muted-foreground font-mono">id: {selectedNode.id}</span>
          </div>
          {selectedNode.detail && selectedNode.detail.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-foreground">
              {selectedNode.detail.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
          <div className="text-muted-foreground flex flex-wrap gap-3 pt-1">
            {selectedNode.next_id && <span>→ next: <code className="font-mono">{selectedNode.next_id}</code></span>}
            {selectedNode.yes_id  && <span className="text-emerald-600">✓ yes: <code className="font-mono">{selectedNode.yes_id}</code></span>}
            {selectedNode.no_id   && <span className="text-slate-500">✗ no: <code className="font-mono">{selectedNode.no_id}</code></span>}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border rounded px-3 py-2 bg-muted/30">
        {[
          { shape: "pill-dark",    label: "Start / Terminal" },
          { shape: "diamond",      label: "Decision (Yes/No)" },
          { shape: "rect-blue",    label: "Evaluation / Process" },
          { shape: "rect-green",   label: "Action / Treatment" },
          { shape: "pill-red",     label: "ER Escalation" },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            {{
              "pill-dark":  <span className="inline-block w-8 h-3 rounded-full bg-slate-800" />,
              "diamond":    <span className="inline-block w-3 h-3 bg-amber-400 rotate-45" />,
              "rect-blue":  <span className="inline-block w-8 h-3 rounded bg-blue-100 border border-blue-400" />,
              "rect-green": <span className="inline-block w-8 h-3 rounded bg-green-100 border border-green-500" />,
              "pill-red":   <span className="inline-block w-8 h-3 rounded-full bg-red-900" />,
            }[l.shape]}
            {l.label}
          </span>
        ))}
        <span className="ml-auto italic">Click any node to inspect it</span>
      </div>
    </div>
  );
}

// ─── System prefix → display label ───────────────────────────────────────────

const SYSTEM_LABELS: Record<string, string> = {
  chest:    "Chest / Cardiac",
  cardio:   "Cardiology",
  pulm:     "Pulmonology",
  ent:      "ENT",
  gi:       "Gastroenterology",
  gu:       "Genitourinary",
  neuro:    "Neurology",
  msk:      "Musculoskeletal",
  derm:     "Dermatology",
  psych:    "Psychiatry",
  tox:      "Toxicology",
  obs:      "OB / GYN",
  peds:     "Pediatrics",
  ortho:    "Orthopedics",
  oph:      "Ophthalmology",
  endo:     "Endocrinology",
  hem:      "Hematology",
  infect:   "Infectious Disease",
  obesity:  "Primary Care",
  general:  "General",
  sore:     "ENT",
  cough:    "Respiratory",
  fever:    "Infectious Disease",
  dizziness:"Neurology / ENT",
  back:     "Musculoskeletal",
  head:     "Neurology",
};

function systemGroup(id: string): string {
  const prefix = id.split("_")[0].toLowerCase();
  return SYSTEM_LABELS[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

const SYSTEM_COLORS: Record<string, string> = {
  "Chest / Cardiac":    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "Cardiology":         "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "Pulmonology":        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "ENT":                "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "Gastroenterology":   "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "Genitourinary":      "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  "Neurology":          "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "Neurology / ENT":    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "Musculoskeletal":    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  "Dermatology":        "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "Psychiatry":         "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "Toxicology":         "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "OB / GYN":           "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  "Pediatrics":         "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  "Primary Care":       "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "Respiratory":        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "Infectious Disease": "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300",
  "Endocrinology":      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

// ─── Complaint Picklist ───────────────────────────────────────────────────────

interface ComplaintRow {
  complaint_id: string;
  rule_cnt: number;
  critical: number;
  red_flags: number;
}

function ComplaintPicklist({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch]         = useState("");
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const searchRef                   = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/master-rules/complaints"],
    queryFn: async () => {
      const r = await fetch("/api/master-rules/complaints", {
        credentials: "include",
        headers: authHeaders(),
      });
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const complaints: ComplaintRow[] = data?.complaints ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? complaints.filter(c => c.complaint_id.toLowerCase().includes(q)) : complaints;
  }, [complaints, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ComplaintRow[]>();
    for (const c of filtered) {
      const grp = systemGroup(c.complaint_id);
      if (!map.has(grp)) map.set(grp, []);
      map.get(grp)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function toggleGroup(grp: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(grp) ? next.delete(grp) : next.add(grp);
      return next;
    });
  }

  useEffect(() => { searchRef.current?.focus(); }, []);

  return (
    <div className="flex flex-col border rounded-lg bg-card overflow-hidden" style={{ width: 280, minWidth: 220 }}>
      {/* Search bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/40">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={searchRef}
          data-testid="cdt-search-complaint"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search complaints…"
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-3 py-1 text-[10px] text-muted-foreground border-b bg-muted/20">
        {isLoading ? "Loading…" : `${filtered.length} of ${complaints.length} complaints`}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: 420 }}>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading complaints…
          </div>
        )}

        {!isLoading && grouped.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No matches for "{search}"</div>
        )}

        {grouped.map(([grp, items]) => {
          const isOpen = !collapsed.has(grp);
          const colorCls = SYSTEM_COLORS[grp] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
          return (
            <div key={grp}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(grp)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40 transition-colors border-b"
              >
                {isOpen
                  ? <ChevronDown className="h-3 w-3 shrink-0" />
                  : <ChevronRight className="h-3 w-3 shrink-0" />
                }
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${colorCls}`}>{grp}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{items.length}</span>
              </button>

              {/* Items */}
              {isOpen && items.map(c => {
                const isSelected = c.complaint_id === selected;
                return (
                  <button
                    key={c.complaint_id}
                    data-testid={`cdt-pick-${c.complaint_id}`}
                    onClick={() => onSelect(c.complaint_id)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors border-b border-border/40
                      ${isSelected
                        ? "bg-blue-600 text-white"
                        : "hover:bg-muted/60 text-foreground"
                      }`}
                  >
                    <span className={`text-[11px] font-mono truncate max-w-[160px] ${isSelected ? "text-white" : ""}`}>
                      {c.complaint_id}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {Number(c.critical) > 0 && (
                        <span className={`text-[9px] font-bold px-1 rounded ${isSelected ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>
                          ⚠ {c.critical}
                        </span>
                      )}
                      <span className={`text-[9px] ${isSelected ? "text-blue-200" : "text-muted-foreground"}`}>
                        {c.rule_cnt}r
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ClinicalDecisionTree({ initialComplaint }: { initialComplaint?: string }) {
  const [complaint, setComplaint] = useState(initialComplaint ?? "");
  const [refresh,   setRefresh  ] = useState(false);

  const queryKey = ["/api/master-rules/flowchart", complaint, refresh];

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey,
    queryFn: async () => {
      const url = `/api/master-rules/flowchart/${encodeURIComponent(complaint)}${refresh ? "?refresh=true" : ""}`;
      const r = await fetch(url, { credentials: "include", headers: authHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: !!complaint,
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  const flowchart: Flowchart | null = data?.flowchart ?? null;
  const cached = data?.cached ?? false;

  function pick(id: string) {
    setRefresh(false);
    setComplaint(id);
  }

  function regenerate() {
    setRefresh(r => !r);
  }

  return (
    <div className="flex gap-4 items-start">
      {/* ── LEFT: Complaint Picklist ─────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> Select Complaint
        </div>
        <ComplaintPicklist selected={complaint} onSelect={pick} />
      </div>

      {/* ── RIGHT: Flowchart area ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* Header row */}
        {complaint && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold font-mono text-blue-700 dark:text-blue-400">{complaint}</span>
            {flowchart && (
              <button
                data-testid="cdt-btn-refresh"
                onClick={regenerate}
                className="flex items-center gap-1 px-3 h-7 text-xs rounded border hover:bg-muted transition-colors text-muted-foreground"
                title="Regenerate from KB rules (costs AI tokens)"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
            {cached && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" /> Cached
              </span>
            )}
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating decision tree from KB rules…
              </span>
            )}
          </div>
        )}

      {/* Error */}
      {isError && (
        <div className="border border-red-300 bg-red-50 dark:bg-red-950 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
          <strong>Failed to generate flowchart:</strong>{" "}
          {(error as Error).message}
          <div className="text-xs mt-1 text-muted-foreground">
            Check that the complaint ID exists in the knowledge base and has active rules.
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="border rounded-xl bg-muted/30 p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <div className="text-sm text-muted-foreground text-center">
            GPT-4o is reading the clinical rules and constructing the decision tree…
            <br />
            <span className="text-xs">This takes ~5–10 seconds. Result is cached for future loads.</span>
          </div>
        </div>
      )}

      {/* Flowchart */}
      {flowchart && !isLoading && (
        <div className="space-y-2">
          <div className="font-bold text-base">{flowchart.title}</div>
          <div className="text-xs text-muted-foreground">
            {flowchart.nodes?.length ?? 0} nodes · {complaint}
            {cached ? " · served from cache" : " · freshly generated"}
          </div>
          <FlowchartSVG fc={flowchart} />
        </div>
      )}

      {/* Empty state — no complaint selected yet */}
      {!complaint && !isLoading && (
        <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <div className="text-4xl mb-3">🩺</div>
          <div className="font-medium">Pick a complaint from the list on the left</div>
          <div className="text-xs mt-1">
            GPT-4o will read the clinical rules from the knowledge base and produce a
            branching decision flowchart. Results are cached after the first generation.
          </div>
        </div>
      )}

      {/* Empty state — complaint selected but no tree yet */}
      {complaint && !flowchart && !isLoading && !isError && (
        <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground">
          <div className="text-3xl mb-2">🔄</div>
          <div className="font-medium text-sm">Loading decision tree for <code className="font-mono bg-muted px-1 rounded">{complaint}</code>…</div>
        </div>
      )}

      </div>
    </div>
  );
}
