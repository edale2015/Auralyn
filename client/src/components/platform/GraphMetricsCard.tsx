type Props = {
  result: any;
};

export default function GraphMetricsCard({ result }: Props) {
  const nodes = result?.nodes ?? [];
  const edges = result?.edges ?? [];

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Graph Metrics</h2>

      {!result ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-700">
            Total trace rows: <span className="font-semibold">{result?.totalTraceRows ?? 0}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Top nodes</div>
              {nodes.length === 0 ? (
                <div className="text-sm text-slate-400">No node data yet.</div>
              ) : (
                <div className="space-y-2">
                  {nodes.slice(0, 8).map((row: any, idx: number) => (
                    <div key={idx} className="rounded-xl bg-slate-50 p-3 text-sm">
                      <div className="font-medium">{row.node}</div>
                      <div className="text-slate-600">
                        count={row.count} | avgLatency={Number(row.avgLatencyMs).toFixed(1)} ms
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Top edges</div>
              {edges.length === 0 ? (
                <div className="text-sm text-slate-400">No edge data yet.</div>
              ) : (
                <div className="space-y-2">
                  {edges.slice(0, 8).map((row: any, idx: number) => (
                    <div key={idx} className="rounded-xl bg-slate-50 p-3 text-sm">
                      <div className="font-medium">{row.edge}</div>
                      <div className="text-slate-600">count={row.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
