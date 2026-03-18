import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, Save, ShieldCheck } from "lucide-react";

export default function PackQuestionsAdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [validation, setValidation] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/pack-admin/questions");
    const json = await res.json();
    setRows(json.rows || []);
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const byPack: Record<string, any[]> = {};
    for (const row of rows) {
      byPack[row.packId] = byPack[row.packId] || [];
      byPack[row.packId].push(row);
    }
    for (const k of Object.keys(byPack)) {
      byPack[k].sort((a: any, b: any) => a.priority - b.priority);
    }
    return byPack;
  }, [rows]);

  function openRow(row: any) {
    setSelected(row);
    setEditorValue(JSON.stringify(row, null, 2));
    setValidation(null);
  }

  async function validateRow() {
    try {
      const parsed = JSON.parse(editorValue);
      const issues: any[] = [];
      if (!parsed.packId) issues.push({ severity: "error", field: "packId", message: "Missing packId" });
      if (!parsed.questionId) issues.push({ severity: "error", field: "questionId", message: "Missing questionId" });
      if (!parsed.prompt) issues.push({ severity: "error", field: "prompt", message: "Missing prompt" });
      setValidation({ ok: !issues.some((x: any) => x.severity === "error"), issues });
    } catch {
      setValidation({ ok: false, issues: [{ severity: "error", field: "json", message: "Invalid JSON" }] });
    }
  }

  async function saveRow() {
    try {
      setSaving(true);
      const parsed = JSON.parse(editorValue);
      const res = await fetch("/api/pack-admin/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      setValidation(json.validation || null);
      if (res.ok) {
        await load();
        openRow(parsed);
      }
    } catch {
      setValidation({ ok: false, issues: [{ severity: "error", field: "save", message: "Save failed" }] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6" data-testid="pack-questions-admin-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Pack Questions Admin</h1>
        <p className="text-muted-foreground">Manage normalized question rows for symptom packs</p>
      </div>

      <div className="grid grid-cols-[380px_1fr] gap-6 h-[calc(100vh-180px)]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Questions by Pack</CardTitle>
            <Badge variant="outline" data-testid="badge-question-count">{rows.length} questions</Badge>
          </CardHeader>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <CardContent className="space-y-4">
              {Object.entries(grouped).map(([packId, packRows]) => (
                <div key={packId}>
                  <div className="font-semibold text-sm mb-2 text-primary" data-testid={`text-pack-group-${packId}`}>{packId}</div>
                  <div className="space-y-1.5">
                    {(packRows as any[]).map((row: any) => (
                      <button
                        key={row.id}
                        onClick={() => openRow(row)}
                        className={`w-full text-left p-2.5 rounded-lg border text-sm transition-colors ${
                          selected?.id === row.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                        data-testid={`button-question-${row.id}`}
                      >
                        <div className="font-medium">{row.priority}. {row.prompt}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {row.questionId} &middot; {row.type}
                          {row.required && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">required</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No questions found</p>
              )}
            </CardContent>
          </ScrollArea>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {selected ? `Editing: ${selected.questionId}` : "Select a question"}
                </CardTitle>
                {selected && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={validateRow} data-testid="button-validate-question">
                      <ShieldCheck className="w-4 h-4 mr-1" /> Validate
                    </Button>
                    <Button size="sm" onClick={saveRow} disabled={saving} data-testid="button-save-question">
                      <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editorValue}
                onChange={e => setEditorValue(e.target.value)}
                className="font-mono text-xs min-h-[50vh]"
                placeholder="Select a question from the left panel to edit..."
                data-testid="textarea-question-editor"
              />
            </CardContent>
          </Card>

          {validation && (
            <Card className={validation.ok ? "border-green-500/30" : "border-red-500/30"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {validation.ok ? (
                    <><CheckCircle2 className="w-4 h-4 text-green-500" /> Validation Passed</>
                  ) : (
                    <><AlertCircle className="w-4 h-4 text-red-500" /> Validation Issues</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {validation.issues?.length > 0 ? (
                  <div className="space-y-1">
                    {validation.issues.map((issue: any, i: number) => (
                      <div key={i} className={`text-xs p-2 rounded ${issue.severity === "error" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}>
                        [{issue.severity}] {issue.field}: {issue.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No issues found</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
