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

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Info } from "lucide-react";
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

// ─── Main export ──────────────────────────────────────────────────────────────

const COMMON_COMPLAINTS = [
  "chest_pain", "sore_throat", "dizziness", "gi_abdominal_pain",
  "neuro_headache", "gu_hematuria", "gi_diarrhea", "msk_back_pain",
  "pulm_shortness_of_breath", "ent_ear_pain", "derm_rash", "gu_uti_symptoms",
];

export default function ClinicalDecisionTree({ initialComplaint }: { initialComplaint?: string }) {
  const [complaint, setComplaint] = useState(initialComplaint ?? "chest_pain");
  const [input,     setInput    ] = useState(initialComplaint ?? "chest_pain");
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
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  const flowchart: Flowchart | null = data?.flowchart ?? null;
  const cached = data?.cached ?? false;

  function load() {
    setComplaint(input.trim());
    setRefresh(false);
  }

  function regenerate() {
    setRefresh(true);
    setComplaint(input.trim());
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Complaint:</label>
        <input
          data-testid="cdt-input-complaint"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load(); }}
          placeholder="e.g. chest_pain, sore_throat, dizziness…"
          className="h-8 text-xs font-mono border rounded px-2 w-64 bg-background"
        />
        <button
          data-testid="cdt-btn-load"
          onClick={load}
          className="px-3 h-8 text-xs rounded border bg-card hover:bg-muted transition-colors font-medium"
        >
          Generate
        </button>
        {flowchart && (
          <button
            data-testid="cdt-btn-refresh"
            onClick={regenerate}
            className="flex items-center gap-1 px-3 h-8 text-xs rounded border hover:bg-muted transition-colors text-muted-foreground"
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
            Generating clinical decision tree from KB rules…
          </span>
        )}
      </div>

      {/* Quick-pick chips */}
      <div className="flex flex-wrap gap-1.5">
        {COMMON_COMPLAINTS.map(c => (
          <button
            key={c}
            data-testid={`cdt-chip-${c}`}
            onClick={() => { setInput(c); setComplaint(c); setRefresh(false); }}
            className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors
              ${complaint === c ? "bg-blue-600 text-white border-blue-600" : "bg-muted hover:bg-muted/80 border-border"}`}
          >
            {c}
          </button>
        ))}
      </div>

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

      {/* Empty state */}
      {!flowchart && !isLoading && !isError && (
        <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <div className="text-4xl mb-3">🩺</div>
          <div className="font-medium">Select a complaint above and click Generate</div>
          <div className="text-xs mt-1">
            GPT-4o will read the clinical rules from the knowledge base and produce a
            branching decision flowchart like the clinical reference charts.
          </div>
        </div>
      )}
    </div>
  );
}
