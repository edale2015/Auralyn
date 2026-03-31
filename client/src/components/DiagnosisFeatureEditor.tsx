import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle, TrendingUp, BarChart2, Hash, GitBranch } from "lucide-react";

type FeatureType = "boolean" | "categorical" | "numeric" | "range";

interface FeatureModel {
  id: number;
  ruleId: string;
  featureKey: string;
  featureType: FeatureType;
  pPresent: number | null;
  pAbsent: number | null;
  categoricalMap: Record<string, number> | null;
  mean: number | null;
  stdDev: number | null;
  minValue: number | null;
  maxValue: number | null;
  weight: number;
  isRequired: boolean;
  source: string;
  active: boolean;
}

const FEATURE_TYPE_META: Record<FeatureType, { label: string; color: string; icon: any }> = {
  boolean:     { label: "Boolean",     color: "bg-blue-100 text-blue-800",   icon: CheckCircle },
  categorical: { label: "Categorical", color: "bg-purple-100 text-purple-800", icon: GitBranch },
  numeric:     { label: "Numeric",     color: "bg-green-100 text-green-800",  icon: TrendingUp },
  range:       { label: "Range",       color: "bg-amber-100 text-amber-800",  icon: BarChart2 },
};

function validateFeature(f: Partial<FeatureModel>): string[] {
  const warns: string[] = [];
  if (f.featureType === "boolean") {
    if (f.pPresent == null || f.pAbsent == null) warns.push("Boolean features require p_present and p_absent.");
    if ((f.pPresent ?? 0) < 0 || (f.pPresent ?? 0) > 1) warns.push("p_present must be in [0, 1].");
    if ((f.pAbsent ?? 0) < 0 || (f.pAbsent ?? 0) > 1) warns.push("p_absent must be in [0, 1].");
    if ((f.pPresent ?? 0) < (f.pAbsent ?? 0)) warns.push("p_present < p_absent — feature is rare. Verify intent.");
  }
  if (f.featureType === "numeric") {
    if (!f.mean) warns.push("Numeric features require a mean.");
    if (!f.stdDev || (f.stdDev ?? 0) <= 0) warns.push("Numeric features require std_dev > 0.");
  }
  if (f.featureType === "range") {
    if (f.minValue == null || f.maxValue == null) warns.push("Range features require min_value and max_value.");
    if ((f.minValue ?? 0) >= (f.maxValue ?? 0)) warns.push("min_value must be less than max_value.");
  }
  if ((f.weight ?? 1) <= 0 || (f.weight ?? 1) > 5) warns.push("Weight should be in (0, 5].");
  return warns;
}

// ─── Boolean Feature Card ─────────────────────────────────────────────────────
function BooleanCard({ feature, onSave, onDelete }: { feature: FeatureModel; onSave: (f: Partial<FeatureModel>) => void; onDelete: () => void }) {
  const [pPresent, setPPresent] = useState(String(feature.pPresent ?? 0.5));
  const [pAbsent, setPAbsent] = useState(String(feature.pAbsent ?? 0.1));
  const [weight, setWeight] = useState(String(feature.weight ?? 1));
  const draft = { ...feature, pPresent: parseFloat(pPresent), pAbsent: parseFloat(pAbsent), weight: parseFloat(weight) };
  const warns = validateFeature(draft);
  const lr = (parseFloat(pPresent) / Math.max(parseFloat(pAbsent), 0.001)).toFixed(2);

  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-white dark:bg-slate-900">
      <div className="col-span-3 flex flex-col gap-1">
        <div className="font-mono text-sm font-semibold">{feature.featureKey}</div>
        <Badge className={`text-xs w-fit ${FEATURE_TYPE_META.boolean.color}`}>Boolean</Badge>
        {feature.source && <span className="text-xs text-muted-foreground">via {feature.source}</span>}
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">P(feature | diagnosis)</label>
        <Input type="number" min={0} max={1} step={0.01} value={pPresent} onChange={e => setPPresent(e.target.value)} className="h-7 text-sm" data-testid={`input-p-present-${feature.id}`} />
        <div className="w-full bg-muted rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round(parseFloat(pPresent) * 100)}%` }} /></div>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">P(feature | ¬diagnosis)</label>
        <Input type="number" min={0} max={1} step={0.01} value={pAbsent} onChange={e => setPAbsent(e.target.value)} className="h-7 text-sm" data-testid={`input-p-absent-${feature.id}`} />
        <div className="w-full bg-muted rounded-full h-1.5"><div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${Math.round(parseFloat(pAbsent) * 100)}%` }} /></div>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Weight</label>
        <Input type="number" min={0.1} max={5} step={0.1} value={weight} onChange={e => setWeight(e.target.value)} className="h-7 text-sm" data-testid={`input-weight-${feature.id}`} />
        <div className="text-xs text-muted-foreground">LR = <span className={`font-bold ${parseFloat(lr) > 1 ? "text-green-600" : "text-red-600"}`}>{lr}</span></div>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        {warns.length > 0 && (
          <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{warns[0]}</div>
        )}
      </div>
      <div className="col-span-1 flex flex-col gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({ pPresent: parseFloat(pPresent), pAbsent: parseFloat(pAbsent), weight: parseFloat(weight) })} disabled={warns.length > 0} data-testid={`btn-save-${feature.id}`}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={onDelete} data-testid={`btn-delete-${feature.id}`}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

// ─── Numeric Feature Card ──────────────────────────────────────────────────────
function NumericCard({ feature, onSave, onDelete }: { feature: FeatureModel; onSave: (f: Partial<FeatureModel>) => void; onDelete: () => void }) {
  const [mean, setMean] = useState(String(feature.mean ?? ""));
  const [stdDev, setStdDev] = useState(String(feature.stdDev ?? ""));
  const [weight, setWeight] = useState(String(feature.weight ?? 1));
  const draft = { ...feature, mean: parseFloat(mean), stdDev: parseFloat(stdDev), weight: parseFloat(weight) };
  const warns = validateFeature(draft);

  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-white dark:bg-slate-900">
      <div className="col-span-3 flex flex-col gap-1">
        <div className="font-mono text-sm font-semibold">{feature.featureKey}</div>
        <Badge className={`text-xs w-fit ${FEATURE_TYPE_META.numeric.color}`}>Numeric</Badge>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Mean</label>
        <Input type="number" step="any" value={mean} onChange={e => setMean(e.target.value)} className="h-7 text-sm" data-testid={`input-mean-${feature.id}`} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Std Dev</label>
        <Input type="number" step="any" min={0} value={stdDev} onChange={e => setStdDev(e.target.value)} className="h-7 text-sm" data-testid={`input-stddev-${feature.id}`} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Weight</label>
        <Input type="number" min={0.1} max={5} step={0.1} value={weight} onChange={e => setWeight(e.target.value)} className="h-7 text-sm" />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        {warns.length > 0 && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{warns[0]}</div>}
      </div>
      <div className="col-span-1 flex flex-col gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({ mean: parseFloat(mean), stdDev: parseFloat(stdDev), weight: parseFloat(weight) })} disabled={warns.length > 0} data-testid={`btn-save-${feature.id}`}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

// ─── Range Feature Card ────────────────────────────────────────────────────────
function RangeCard({ feature, onSave, onDelete }: { feature: FeatureModel; onSave: (f: Partial<FeatureModel>) => void; onDelete: () => void }) {
  const [min, setMin] = useState(String(feature.minValue ?? ""));
  const [max, setMax] = useState(String(feature.maxValue ?? ""));
  const [weight, setWeight] = useState(String(feature.weight ?? 1));
  const draft = { ...feature, minValue: parseFloat(min), maxValue: parseFloat(max), weight: parseFloat(weight) };
  const warns = validateFeature(draft);

  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-white dark:bg-slate-900">
      <div className="col-span-3 flex flex-col gap-1">
        <div className="font-mono text-sm font-semibold">{feature.featureKey}</div>
        <Badge className={`text-xs w-fit ${FEATURE_TYPE_META.range.color}`}>Range</Badge>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Min Value</label>
        <Input type="number" step="any" value={min} onChange={e => setMin(e.target.value)} className="h-7 text-sm" data-testid={`input-min-${feature.id}`} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Max Value</label>
        <Input type="number" step="any" value={max} onChange={e => setMax(e.target.value)} className="h-7 text-sm" data-testid={`input-max-${feature.id}`} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Weight</label>
        <Input type="number" min={0.1} max={5} step={0.1} value={weight} onChange={e => setWeight(e.target.value)} className="h-7 text-sm" />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        {warns.length > 0 && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{warns[0]}</div>}
      </div>
      <div className="col-span-1 flex flex-col gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({ minValue: parseFloat(min), maxValue: parseFloat(max), weight: parseFloat(weight) })} disabled={warns.length > 0} data-testid={`btn-save-${feature.id}`}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

// ─── Categorical Feature Card ─────────────────────────────────────────────────
function CategoricalCard({ feature, onSave, onDelete }: { feature: FeatureModel; onSave: (f: Partial<FeatureModel>) => void; onDelete: () => void }) {
  const initialMap = feature.categoricalMap ?? {};
  const [catMap, setCatMap] = useState<Record<string, number>>(initialMap);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("0.5");
  const [weight, setWeight] = useState(String(feature.weight ?? 1));
  const total = Object.values(catMap).reduce((a, b) => a + b, 0);
  const normalised = total > 0 && Math.abs(total - 1) > 0.01;

  const addCategory = () => {
    if (!newKey.trim()) return;
    setCatMap(prev => ({ ...prev, [newKey.trim()]: parseFloat(newVal) }));
    setNewKey(""); setNewVal("0.5");
  };
  const removeCategory = (k: string) => setCatMap(prev => { const n = { ...prev }; delete n[k]; return n; });
  const updateVal = (k: string, v: string) => setCatMap(prev => ({ ...prev, [k]: parseFloat(v) }));

  return (
    <div className="p-3 border rounded-lg bg-white dark:bg-slate-900 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{feature.featureKey}</span>
          <Badge className={`text-xs ${FEATURE_TYPE_META.categorical.color}`}>Categorical</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="sm" className="h-7 text-xs" onClick={() => onSave({ categoricalMap: catMap, weight: parseFloat(weight) })} data-testid={`btn-save-${feature.id}`}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {normalised && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Probabilities sum to {total.toFixed(3)} — consider normalising to 1.0</div>}
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(catMap).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <span className="font-mono text-xs w-24 truncate">{k}</span>
            <Input type="number" min={0} max={1} step={0.01} value={v} onChange={e => updateVal(k, e.target.value)} className="h-6 text-xs w-20" />
            <div className="flex-1 bg-muted rounded-full h-1.5"><div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${Math.round(v * 100)}%` }} /></div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => removeCategory(k)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
      </div>
      <div className="flex gap-1 items-center">
        <Input placeholder="category key" value={newKey} onChange={e => setNewKey(e.target.value)} className="h-6 text-xs flex-1" />
        <Input type="number" min={0} max={1} step={0.01} value={newVal} onChange={e => setNewVal(e.target.value)} className="h-6 text-xs w-20" />
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={addCategory}><Plus className="h-3 w-3 mr-1" />Add</Button>
        <span className="text-xs text-muted-foreground">Weight:</span>
        <Input type="number" min={0.1} max={5} step={0.1} value={weight} onChange={e => setWeight(e.target.value)} className="h-6 text-xs w-16" />
      </div>
    </div>
  );
}

// ─── Add Feature Form ─────────────────────────────────────────────────────────
function AddFeatureForm({ ruleId, onAdded }: { ruleId: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [featureKey, setFeatureKey] = useState("");
  const [featureType, setFeatureType] = useState<FeatureType>("boolean");

  const defaults: Record<FeatureType, object> = {
    boolean:     { p_present: 0.5, p_absent: 0.1 },
    numeric:     { mean: 37.0, std_dev: 0.5 },
    range:       { min_value: 36.5, max_value: 37.5 },
    categorical: { categorical_map: { mild: 0.5, moderate: 0.3, severe: 0.2 } },
  };

  const add = async () => {
    if (!featureKey.trim()) return;
    const r = await fetch("/api/kb/feature-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId, featureKey: featureKey.trim(), featureType, weight: 1.0, source: "ui_edit", active: true, ...defaults[featureType] }),
    });
    if (r.ok) { toast({ title: "Feature added" }); setFeatureKey(""); onAdded(); }
    else { const d = await r.json(); toast({ title: "Error", description: d.error, variant: "destructive" }); }
  };

  return (
    <div className="flex gap-2 items-center p-3 border rounded-lg bg-muted/30">
      <Plus className="h-4 w-4 text-muted-foreground" />
      <Input placeholder="feature_key (e.g. fever, age, severity)" value={featureKey} onChange={e => setFeatureKey(e.target.value)} className="h-8 text-sm flex-1" data-testid="input-new-feature-key" onKeyDown={e => e.key === "Enter" && add()} />
      <Select value={featureType} onValueChange={v => setFeatureType(v as FeatureType)}>
        <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(FEATURE_TYPE_META) as FeatureType[]).map(t => <SelectItem key={t} value={t}>{FEATURE_TYPE_META[t].label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8" onClick={add} data-testid="btn-add-feature">Add Feature</Button>
    </div>
  );
}

// ─── Main Editor ───────────────────────────────────────────────────────────────
export default function DiagnosisFeatureEditor({ ruleId }: { ruleId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<FeatureType | "all">("all");

  const { data: features = [], isLoading, refetch } = useQuery<FeatureModel[]>({
    queryKey: ["/api/kb/feature-models", ruleId],
    queryFn: async () => (await fetch(`/api/kb/feature-models?rule_id=${ruleId}`)).json(),
    enabled: !!ruleId,
  });

  const saveMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FeatureModel> }) => {
      const r = await fetch(`/api/kb/feature-models/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Feature saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/kb/feature-models", ruleId] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/kb/feature-models/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Feature deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/kb/feature-models", ruleId] });
    },
  });

  const migrateMut = useMutation({
    mutationFn: async () => (await fetch("/api/kb/feature-models/migrate", { method: "POST" })).json(),
    onSuccess: (d) => { toast({ title: `Migrated ${d.migrated ?? 0} feature likelihoods` }); refetch(); },
  });

  const visibleFeatures = filterType === "all" ? features : features.filter(f => f.featureType === filterType);
  const typeCounts = (Object.keys(FEATURE_TYPE_META) as FeatureType[]).reduce((acc, t) => {
    acc[t] = features.filter(f => f.featureType === t).length;
    return acc;
  }, {} as Record<FeatureType, number>);

  if (!ruleId) return (
    <div className="text-center py-12 text-muted-foreground">
      <Hash className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>Select a diagnosis rule to edit its feature models.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Features for <span className="font-mono text-blue-600">{ruleId}</span></h3>
          <Badge variant="outline">{features.length} total</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => migrateMut.mutate()} disabled={migrateMut.isPending}>
            <RefreshCw className="h-3 w-3 mr-1" />{migrateMut.isPending ? "Migrating…" : "Import from Likelihoods"}
          </Button>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterType("all")} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterType === "all" ? "bg-foreground text-background" : "bg-transparent hover:bg-muted"}`} data-testid="filter-all">
          All ({features.length})
        </button>
        {(Object.keys(FEATURE_TYPE_META) as FeatureType[]).map(t => {
          const meta = FEATURE_TYPE_META[t];
          const Icon = meta.icon;
          return (
            <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${filterType === t ? meta.color + " border-transparent" : "bg-transparent hover:bg-muted"}`} data-testid={`filter-${t}`}>
              <Icon className="h-3 w-3" />{meta.label} ({typeCounts[t]})
            </button>
          );
        })}
      </div>

      {/* Feature list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : visibleFeatures.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No {filterType !== "all" ? filterType : ""} features defined. Add one below.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleFeatures.map(f => {
            const props = {
              key: f.id, feature: f,
              onSave: (data: Partial<FeatureModel>) => saveMut.mutate({ id: f.id, data }),
              onDelete: () => deleteMut.mutate(f.id),
            };
            if (f.featureType === "boolean")     return <BooleanCard     {...props} />;
            if (f.featureType === "numeric")     return <NumericCard      {...props} />;
            if (f.featureType === "range")       return <RangeCard        {...props} />;
            if (f.featureType === "categorical") return <CategoricalCard  {...props} />;
            return null;
          })}
        </div>
      )}

      {/* Add form */}
      <AddFeatureForm ruleId={ruleId} onAdded={refetch} />

      {/* Probability preview panel */}
      {features.filter(f => f.featureType === "boolean").length > 0 && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4" />Likelihood Ratio Preview (boolean features)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1">
              {features.filter(f => f.featureType === "boolean").map(f => {
                const lr = ((f.pPresent ?? 0.5) / Math.max((f.pAbsent ?? 0.1), 0.001));
                const logLr = Math.log(lr);
                return (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono w-40 truncate">{f.featureKey}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      {logLr >= 0
                        ? <div className="absolute inset-y-0 bg-green-400 rounded-r-full" style={{ left: "50%", width: `${Math.min(Math.abs(logLr / Math.log(10)) * 20, 50)}%` }} />
                        : <div className="absolute inset-y-0 bg-red-400 rounded-l-full" style={{ right: "50%", width: `${Math.min(Math.abs(logLr / Math.log(10)) * 20, 50)}%` }} />
                      }
                    </div>
                    <span className={`font-mono font-bold w-14 text-right ${lr > 1 ? "text-green-600" : "text-red-600"}`}>LR {lr.toFixed(2)}×</span>
                    <span className="text-muted-foreground w-8 text-right">×{f.weight}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
