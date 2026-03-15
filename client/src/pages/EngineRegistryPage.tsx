import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Layers, Cpu, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface EngineEntry {
  id: string;
  label: string;
  layer: string;
  file: string;
  exportedFn: string;
  description: string;
  status: "live" | "stub" | "planned";
  inputTypes: string[];
  outputTypes: string[];
  dependencies: string[];
}

interface LayerInfo {
  layer: string;
  label: string;
  color: string;
  description: string;
}

interface RegistryData {
  engines: EngineEntry[];
  layers: LayerInfo[];
  stats: { total: number; byStatus: Record<string, number>; byLayer: Record<string, number> };
}

const STATUS_ICONS = {
  live: <CheckCircle className="h-3 w-3 text-green-500" />,
  stub: <Clock className="h-3 w-3 text-yellow-500" />,
  planned: <AlertCircle className="h-3 w-3 text-gray-400" />,
};

const STATUS_COLORS = {
  live: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  stub: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  planned: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function EngineRegistryPage() {
  const [search, setSearch] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<string>("all");
  const [expandedEngine, setExpandedEngine] = useState<string | null>(null);

  const { data, isLoading } = useQuery<RegistryData>({ queryKey: ["/api/engine-registry"] });

  const engines = data?.engines ?? [];
  const layers = data?.layers ?? [];
  const stats = data?.stats;

  const filtered = engines.filter((e) => {
    const matchSearch = !search || e.label.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
    const matchLayer = selectedLayer === "all" || e.layer === selectedLayer;
    return matchSearch && matchLayer;
  });

  const grouped: Record<string, EngineEntry[]> = {};
  for (const e of filtered) {
    if (!grouped[e.layer]) grouped[e.layer] = [];
    grouped[e.layer].push(e);
  }

  const layerOrder = layers.map((l) => l.layer);
  const sortedLayerKeys = Object.keys(grouped).sort((a, b) => layerOrder.indexOf(a) - layerOrder.indexOf(b));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="h-6 w-6 text-violet-500" />
            Engine Registry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Complete map of all clinical reasoning engines and their architecture layers</p>
        </div>
        {stats && (
          <div className="flex gap-3 flex-wrap">
            <div className="text-center px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
              <div className="text-xl font-bold text-violet-600">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Engines</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="text-xl font-bold text-green-600">{stats.byStatus.live ?? 0}</div>
              <div className="text-xs text-muted-foreground">Live</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <div className="text-xl font-bold text-yellow-600">{stats.byStatus.stub ?? 0}</div>
              <div className="text-xs text-muted-foreground">Stubs</div>
            </div>
          </div>
        )}
      </div>

      {/* Architecture diagram */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> Architecture Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center justify-start">
            {layers.map((l, i) => (
              <div key={l.layer} className="flex items-center gap-1">
                <button
                  data-testid={`layer-btn-${l.layer}`}
                  onClick={() => setSelectedLayer(selectedLayer === l.layer ? 'all' : l.layer)}
                  className="flex flex-col items-center px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all hover:scale-105"
                  style={{ borderColor: l.color, background: selectedLayer === l.layer ? l.color + '20' : 'transparent', color: l.color }}
                >
                  <span className="font-bold">{l.label.replace(' Layer', '')}</span>
                  <span className="text-[10px] opacity-70">{stats?.byLayer?.[l.layer] ?? 0} engines</span>
                </button>
                {i < layers.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search and filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-engine-search" placeholder="Search engines…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          data-testid="select-layer-filter"
          value={selectedLayer}
          onChange={(e) => setSelectedLayer(e.target.value)}
          className="px-3 py-2 rounded-md border bg-background text-sm"
        >
          <option value="all">All Layers</option>
          {layers.map((l) => <option key={l.layer} value={l.layer}>{l.label}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center text-muted-foreground py-8">Loading engine registry…</div>}

      {/* Engine groups by layer */}
      {sortedLayerKeys.map((layerKey) => {
        const layerInfo = layers.find((l) => l.layer === layerKey);
        return (
          <div key={layerKey} data-testid={`layer-section-${layerKey}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-3 w-3 rounded-full" style={{ background: layerInfo?.color }} />
              <h2 className="font-semibold text-sm">{layerInfo?.label ?? layerKey}</h2>
              <span className="text-xs text-muted-foreground">({grouped[layerKey].length})</span>
              {layerInfo && <span className="text-xs text-muted-foreground hidden sm:block">— {layerInfo.description}</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
              {grouped[layerKey].map((engine) => (
                <Card
                  key={engine.id}
                  data-testid={`card-engine-${engine.id}`}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setExpandedEngine(expandedEngine === engine.id ? null : engine.id)}
                  style={{ borderLeft: `3px solid ${layerInfo?.color ?? '#888'}` }}
                >
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm truncate">{engine.label}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[engine.status]}`}>
                            {STATUS_ICONS[engine.status]} {engine.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{engine.description}</p>
                      </div>
                    </div>
                    {expandedEngine === engine.id && (
                      <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                        <div><span className="font-medium text-muted-foreground">File: </span><span className="font-mono text-[10px] break-all">{engine.file}</span></div>
                        <div><span className="font-medium text-muted-foreground">Export: </span><span className="font-mono">{engine.exportedFn}</span></div>
                        <div className="flex gap-4">
                          <div><span className="font-medium text-muted-foreground">In: </span>{engine.inputTypes.join(', ')}</div>
                          <div><span className="font-medium text-muted-foreground">Out: </span>{engine.outputTypes.join(', ')}</div>
                        </div>
                        {engine.dependencies.length > 0 && <div><span className="font-medium text-muted-foreground">Deps: </span>{engine.dependencies.join(', ')}</div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No engines match your search.</p>
        </div>
      )}
    </div>
  );
}
