import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, Save, Search, Shield, FileCheck } from "lucide-react";
import { RuleBuilderDemoPanel } from "@/components/RuleBuilderDemoPanel";

type RowType = "symptom" | "modifier" | "clinician_algorithm";

interface ValidationIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export default function PackBuilderAdminPage() {
  const [systems, setSystems] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<any>({});
  const [systemFilter, setSystemFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<RowType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeRuleForBuilder, setActiveRuleForBuilder] = useState("");
  const [ruleBuilderFieldIndex, setRuleBuilderFieldIndex] = useState<number>(-1);

  async function load() {
    const token = localStorage.getItem("app_auth_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const [systemsRes, allRes] = await Promise.all([
      fetch("/api/pack-admin/systems", { headers }),
      fetch("/api/pack-admin/all", { headers }),
    ]);
    const systemsJson = await systemsRes.json();
    const allJson = await allRes.json();
    setSystems(systemsJson.systems || []);
    setAllRows(allJson);
  }

  useEffect(() => {
    load();
  }, []);

  const flattened = useMemo(() => {
    const rows = [
      ...(allRows.symptomPackRows || []),
      ...(allRows.modifierPackRows || []),
      ...(allRows.clinicianAlgorithmRows || []),
    ];

    return rows.filter((row: any) => {
      const okSystem = systemFilter === "all" || row.system === systemFilter;
      const okTier = tierFilter === "all" || row.tier === tierFilter;
      const okSearch = !searchTerm || row.title.toLowerCase().includes(searchTerm.toLowerCase()) || row.id.toLowerCase().includes(searchTerm.toLowerCase());
      return okSystem && okTier && okSearch;
    });
  }, [allRows, systemFilter, tierFilter, searchTerm]);

  function openRow(row: any) {
    setSelectedRow(row);
    setEditorValue(JSON.stringify(row, null, 2));
    setValidation(null);
    setSaveMessage("");
    setActiveRuleForBuilder("");
    setRuleBuilderFieldIndex(-1);
  }

  async function validateRow() {
    const token = localStorage.getItem("app_auth_token");
    try {
      const parsed = JSON.parse(editorValue);
      const res = await fetch("/api/pack-admin/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      setValidation(json);
    } catch (err: any) {
      setValidation({
        ok: false,
        issues: [{ severity: "error", field: "json", message: err.message }],
      });
    }
  }

  async function saveRow() {
    const token = localStorage.getItem("app_auth_token");
    try {
      const parsed = JSON.parse(editorValue);

      let endpoint = "/api/pack-admin/symptom";
      if (parsed.tier === "modifier") endpoint = "/api/pack-admin/modifier";
      if (parsed.tier === "clinician_algorithm") endpoint = "/api/pack-admin/algorithm";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(parsed),
      });

      const json = await res.json();

      if (!res.ok) {
        setValidation(json.validation || json);
        setSaveMessage("Save failed - validation errors");
        return;
      }

      setValidation(json.validation || null);
      setSaveMessage("Saved successfully");
      await load();
      openRow(parsed);
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    }
  }

  const handleRuleChange = useCallback((newRule: string) => {
    if (ruleBuilderFieldIndex < 0) return;
    try {
      const parsed = JSON.parse(editorValue);
      const fieldName = selectedRow?.tier === "symptom" ? "autoEscalateRules" :
        selectedRow?.tier === "modifier" ? "triggers" : "entryCriteria";
      const rules = parsed[fieldName] || [];
      rules[ruleBuilderFieldIndex] = newRule;
      parsed[fieldName] = rules;
      setEditorValue(JSON.stringify(parsed, null, 2));
    } catch {
    }
  }, [editorValue, ruleBuilderFieldIndex, selectedRow]);

  function openRuleInBuilder(rule: string, index: number) {
    setActiveRuleForBuilder(rule);
    setRuleBuilderFieldIndex(index);
  }

  function getEditableRules(): string[] {
    try {
      const parsed = JSON.parse(editorValue);
      if (parsed.tier === "symptom") return parsed.autoEscalateRules || [];
      if (parsed.tier === "modifier") return parsed.triggers || [];
      if (parsed.tier === "clinician_algorithm") return parsed.entryCriteria || [];
    } catch {
    }
    return [];
  }

  function getAvailableFields(): string[] {
    try {
      const parsed = JSON.parse(editorValue);
      if (parsed.tier === "symptom" && parsed.questionsJson) {
        const questions = JSON.parse(parsed.questionsJson);
        return questions.map((q: any) => q.id).filter(Boolean);
      }
    } catch {
    }
    return [];
  }

  return (
    <div className="space-y-6" data-testid="pack-builder-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="pack-builder-title">Pack Builder</h1>
        <p className="text-muted-foreground">Edit, validate, and save complaint packs, modifiers, and clinician algorithms</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search packs..."
                  className="pl-9"
                  data-testid="pack-search-input"
                />
              </div>

              <Select value={systemFilter} onValueChange={setSystemFilter}>
                <SelectTrigger data-testid="system-filter">
                  <SelectValue placeholder="All systems" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All systems</SelectItem>
                  {systems.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tierFilter} onValueChange={v => setTierFilter(v as any)}>
                <SelectTrigger data-testid="tier-filter">
                  <SelectValue placeholder="All tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="symptom">Symptom</SelectItem>
                  <SelectItem value="modifier">Modifier</SelectItem>
                  <SelectItem value="clinician_algorithm">Clinician Algorithm</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {flattened.map((row: any) => (
              <button
                key={row.id}
                onClick={() => openRow(row)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedRow?.id === row.id
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                    : "bg-card hover:bg-accent border-border"
                }`}
                data-testid={`pack-row-${row.id}`}
              >
                <div className="font-semibold text-sm">{row.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{row.system}</Badge>
                  <Badge variant="secondary" className="text-xs">{row.tier}</Badge>
                  {!row.isActive && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                </div>
              </button>
            ))}
            {flattened.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No packs match filters</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {selectedRow ? selectedRow.title : "Select a pack to edit"}
                </CardTitle>
                {selectedRow && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={validateRow} data-testid="validate-btn">
                      <FileCheck className="h-4 w-4 mr-1" /> Validate
                    </Button>
                    <Button size="sm" onClick={saveRow} data-testid="save-btn">
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    {saveMessage && (
                      <span className={`text-sm ${saveMessage.includes("fail") || saveMessage.includes("Error") ? "text-red-600" : "text-green-600"}`} data-testid="save-message">
                        {saveMessage}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="json">
                <TabsList>
                  <TabsTrigger value="json">JSON Editor</TabsTrigger>
                  <TabsTrigger value="rules">Rule Builder</TabsTrigger>
                  <TabsTrigger value="validation">Validation</TabsTrigger>
                </TabsList>

                <TabsContent value="json">
                  <Textarea
                    value={editorValue}
                    onChange={e => setEditorValue(e.target.value)}
                    className="font-mono text-xs min-h-[50vh]"
                    data-testid="json-editor"
                  />
                </TabsContent>

                <TabsContent value="rules">
                  {selectedRow ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-2">
                          {selectedRow.tier === "symptom" ? "Auto-Escalate Rules" :
                           selectedRow.tier === "modifier" ? "Triggers" : "Entry Criteria"}
                        </h3>
                        <div className="space-y-2">
                          {getEditableRules().map((rule: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{rule}</code>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRuleInBuilder(rule, idx)}
                                data-testid={`edit-rule-${idx}`}
                              >
                                Edit
                              </Button>
                            </div>
                          ))}
                          {getEditableRules().length === 0 && (
                            <p className="text-sm text-muted-foreground">No rules defined</p>
                          )}
                        </div>
                      </div>

                      {activeRuleForBuilder && (
                        <RuleBuilderDemoPanel
                          initialRule={activeRuleForBuilder}
                          availableFields={getAvailableFields()}
                          onRuleChange={handleRuleChange}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">Select a pack to edit rules</p>
                  )}
                </TabsContent>

                <TabsContent value="validation">
                  {validation ? (
                    <div className="space-y-3" data-testid="validation-results">
                      <div className="flex items-center gap-2">
                        {validation.ok ? (
                          <Badge className="bg-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Valid
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Invalid
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {validation.issues.length} issue{validation.issues.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {validation.issues.map((issue: ValidationIssue, idx: number) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 p-2 rounded text-sm ${
                              issue.severity === "error"
                                ? "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
                                : "bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200"
                            }`}
                            data-testid={`validation-issue-${idx}`}
                          >
                            {issue.severity === "error" ? (
                              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            ) : (
                              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            )}
                            <div>
                              <span className="font-medium">{issue.field}:</span> {issue.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">
                      Click "Validate" to check this pack for errors
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
