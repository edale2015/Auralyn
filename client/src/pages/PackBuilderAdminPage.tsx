import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Package, Settings, Stethoscope, Save, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type RowType = "symptom" | "modifier" | "clinician_algorithm";

export default function PackBuilderAdminPage() {
  const [systems, setSystems] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<any>({});
  const [systemFilter, setSystemFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<RowType | "all">("all");
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [complaintPacks, setComplaintPacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function load() {
    try {
      const [systemsRes, allRes, packsRes] = await Promise.all([
        fetch("/api/pack-admin/systems"),
        fetch("/api/pack-admin/all"),
        fetch("/api/pack-intake/packs"),
      ]);
      const systemsJson = await systemsRes.json();
      const allJson = await allRes.json();
      const packsJson = await packsRes.json();
      setSystems(systemsJson.systems || []);
      setAllRows(allJson);
      setComplaintPacks(packsJson.packs || []);
    } catch (e) {
      console.error("Failed to load pack data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const flattened = useMemo(() => {
    const rows = [
      ...(allRows.symptomPackRows || []).map((r: any) => ({ ...r, _type: "symptom" })),
      ...(allRows.modifierPackRows || []).map((r: any) => ({ ...r, _type: "modifier" })),
      ...(allRows.clinicianAlgorithmRows || []).map((r: any) => ({ ...r, _type: "clinician_algorithm" })),
    ];

    return rows.filter((row: any) => {
      const okSystem = systemFilter === "all" || row.system === systemFilter;
      const okTier = tierFilter === "all" || row.tier === tierFilter;
      return okSystem && okTier;
    });
  }, [allRows, systemFilter, tierFilter]);

  function openRow(row: any) {
    setSelectedRow(row);
    setEditorValue(JSON.stringify(row, null, 2));
  }

  async function saveRow() {
    if (!selectedRow) return;

    try {
      const parsed = JSON.parse(editorValue);
      let endpoint = "/api/pack-admin/symptom";
      if (parsed.tier === "modifier") endpoint = "/api/pack-admin/modifier";
      if (parsed.tier === "clinician_algorithm") endpoint = "/api/pack-admin/algorithm";

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      await load();
      openRow(parsed);
      toast({ title: "Saved", description: `Pack "${parsed.title}" updated successfully.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const tierColor = (tier: string) => {
    if (tier === "symptom") return "default";
    if (tier === "modifier") return "secondary";
    return "outline";
  };

  if (loading) {
    return (
      <div className="p-6" data-testid="pack-builder-loading">
        <h1 className="text-2xl font-bold mb-4">Pack Builder</h1>
        <p className="text-muted-foreground">Loading pack data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="pack-builder-page">
      <h1 className="text-2xl font-bold">Pack Builder Admin</h1>

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor" data-testid="tab-editor"><Settings className="w-4 h-4 mr-1" />Pack Editor</TabsTrigger>
          <TabsTrigger value="complaints" data-testid="tab-complaints"><Stethoscope className="w-4 h-4 mr-1" />Complaint Packs ({complaintPacks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Select value={systemFilter} onValueChange={setSystemFilter}>
                  <SelectTrigger data-testid="select-system"><SelectValue placeholder="All systems" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All systems</SelectItem>
                    {systems.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as any)}>
                  <SelectTrigger data-testid="select-tier"><SelectValue placeholder="All tiers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tiers</SelectItem>
                    <SelectItem value="symptom">Symptom</SelectItem>
                    <SelectItem value="modifier">Modifier</SelectItem>
                    <SelectItem value="clinician_algorithm">Algorithm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-auto" data-testid="pack-list">
                {flattened.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => openRow(row)}
                    className={`w-full text-left p-3 border rounded-lg transition-colors ${
                      selectedRow?.id === row.id ? "bg-primary/10 border-primary" : "hover:bg-muted"
                    }`}
                    data-testid={`pack-row-${row.id}`}
                  >
                    <div className="font-semibold">{row.title}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={tierColor(row.tier)} className="text-xs">{row.tier}</Badge>
                      <span className="text-xs text-muted-foreground">{row.system}</span>
                      {row.isActive && <Badge variant="outline" className="text-xs">Active</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedRow ? selectedRow.title : "Select a pack to edit"}
                </h2>
                {selectedRow && (
                  <Button onClick={saveRow} data-testid="button-save-pack">
                    <Save className="w-4 h-4 mr-1" /> Save
                  </Button>
                )}
              </div>
              <Textarea
                value={editorValue}
                onChange={e => setEditorValue(e.target.value)}
                className="font-mono text-sm min-h-[70vh]"
                placeholder="Select a pack row from the left panel to edit its JSON configuration..."
                data-testid="pack-editor-textarea"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="complaints">
          <Card>
            <CardHeader>
              <CardTitle>30 Complaint-Specific Intake Packs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="complaint-packs-grid">
                {complaintPacks.map((pack: any) => (
                  <div key={pack.complaintId} className="border rounded-lg p-4" data-testid={`complaint-pack-${pack.complaintId}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{pack.title}</span>
                      <Badge variant={
                        pack.likelyDisposition === "er_now" ? "destructive" :
                        pack.likelyDisposition === "telemed_now" ? "secondary" :
                        "default"
                      }>
                        {pack.likelyDisposition}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {pack.aliases?.join(", ")}
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Questions: </span>
                      <span className="font-medium">{pack.coreQuestions?.length || 0}</span>
                      <span className="text-muted-foreground ml-3">Red Flags: </span>
                      <span className="font-medium text-red-500">{pack.redFlagTriggers?.length || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
