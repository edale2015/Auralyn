import { useQuery } from "@tanstack/react-query";

export default function GraphEdgeGuardCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/platform/graph-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/platform/graph-metrics");
      return res.json();
    },
  });

  const edges: any[] = data?.result?.edges ?? [];
  const nodes: any[] = data?.result?.nodes ?? [];
  const totalTraceRows: number = data?.result?.totalTraceRows ?? 0;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Graph Edge / Guard Visualizer</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {totalTraceRows} trace rows
        </span>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading…</div>}

      {!isLoading && edges.length === 0 && nodes.length === 0 && (
        <div className="text-sm text-slate-400">No graph traces yet — run cases in graph mode.</div>
      )}

      {(edges.length > 0 || nodes.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Top Graph Edges
            </div>
            <div className="space-y-1.5">
              {edges.slice(0, 8).map((e: any, idx: number) => {
                const [from, to] = (e.edge ?? "→").split(" -> ");
                const maxCount = edges[0]?.count ?? 1;
                const pct = Math.round((e.count / maxCount) * 100);
                return (
                  <div key={idx} className="rounded-xl bg-slate-50 p-2.5">
                    <div className="flex items-center gap-1 text-xs text-slate-700">
                      <span className="font-medium">{from}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-medium">{to}</span>
                      <span className="ml-auto text-slate-500">{e.count}×</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-slate-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Most-Executed Nodes
            </div>
            <div className="space-y-1.5">
              {nodes.slice(0, 8).map((n: any, idx: number) => {
                const maxCount = nodes[0]?.count ?? 1;
                const pct = Math.round((n.count / maxCount) * 100);
                return (
                  <div key={idx} className="rounded-xl bg-slate-50 p-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate font-medium text-slate-800">{n.node}</span>
                      <span className="text-slate-500">
                        {n.count}× · {Math.round(n.avgLatencyMs)}ms
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-indigo-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
