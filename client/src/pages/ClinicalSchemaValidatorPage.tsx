import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, ShieldAlert, Upload, FileSpreadsheet,
  Loader2, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SeverityLevel = "info" | "warning" | "error" | "critical";

interface ValidationIssue {
  severity: SeverityLevel;
  category: string;
  sheet?: string;
  row?: number;
  column?: string;
  key?: string;
  message: string;
  suggestion?: string;
}

interface SheetResult {
  sheet: string;
  rowCount: number;
  issues: ValidationIssue[];
}

interface ValidationReport {
  ok: boolean;
  generatedAt: number;
  validatedFile?: string;
  summary: {
    sheetCount: number;
    checkedSheets: number;
    issueCount: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  sheetResults: SheetResult[];
}

const SEVERITY_CONFIG: Record<SeverityLevel, { icon: typeof AlertCircle; color: string; bg: string }> = {
  critical: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  error: { icon: AlertCircle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  warning: { icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
};

const CATEGORY_LABELS: Record<string, string> = {
  missing_sheet: "Missing Sheet",
  missing_column: "Missing Column",
  duplicate_key: "Duplicate Key",
  missing_required_value: "Missing Value",
  broken_reference: "Broken Reference",
  invalid_value: "Invalid Value",
  orphan_record: "Orphan Record",
  schema_drift: "Schema Drift",
};

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border text-xs font-medium`} data-testid={`badge-severity-${severity}`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function IssueRow({ issue, index }: { issue: ValidationIssue; index: number }) {
  const cfg = SEVERITY_CONFIG[issue.severity];
  const Icon = cfg.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bg}`} data-testid={`issue-${index}`}>
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={issue.severity} />
          <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[issue.category] || issue.category}</Badge>
          {issue.row && <span className="text-xs text-muted-foreground">Row {issue.row}</span>}
          {issue.column && <span className="text-xs text-muted-foreground font-mono">{issue.column}</span>}
          {issue.key && <span className="text-xs font-mono text-muted-foreground">Key: {issue.key}</span>}
        </div>
        <p className="text-sm">{issue.message}</p>
        {issue.suggestion && (
          <p className="text-xs text-muted-foreground italic">{issue.suggestion}</p>
        )}
      </div>
    </div>
  );
}

function SheetPanel({ result, defaultOpen }: { result: SheetResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<SeverityLevel | "all">("all");

  const criticals = result.issues.filter((i) => i.severity === "critical").length;
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const hasProblems = criticals > 0 || errors > 0;

  const filtered = filter === "all" ? result.issues : result.issues.filter((i) => i.severity === filter);

  return (
    <Card className={hasProblems ? "border-red-200 dark:border-red-800" : ""}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
        data-testid={`sheet-header-${result.sheet}`}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-mono">{result.sheet}</span>
            <span className="text-muted-foreground font-normal text-xs">({result.rowCount} rows)</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {result.issues.length === 0 ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />Pass
              </Badge>
            ) : (
              <>
                {criticals > 0 && <Badge variant="destructive" className="text-xs">{criticals} critical</Badge>}
                {errors > 0 && <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">{errors} errors</Badge>}
                {warnings > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">{warnings} warnings</Badge>}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      {open && result.issues.length > 0 && (
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(["all", "critical", "error", "warning", "info"] as const).map((sev) => {
              const count = sev === "all" ? result.issues.length : result.issues.filter((i) => i.severity === sev).length;
              if (count === 0 && sev !== "all") return null;
              return (
                <Button
                  key={sev}
                  size="sm"
                  variant={filter === sev ? "default" : "outline"}
                  className="text-xs h-7"
                  onClick={(e) => { e.stopPropagation(); setFilter(sev); }}
                  data-testid={`filter-${result.sheet}-${sev}`}
                >
                  {sev === "all" ? `All (${count})` : `${sev} (${count})`}
                </Button>
              );
            })}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((issue, i) => (
              <IssueRow key={i} issue={issue} index={i} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ClinicalSchemaValidatorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [report, setReport] = useState<ValidationReport | null>(null);

  const { data: workbooks, isLoading: workbooksLoading } = useQuery<{ files: { filename: string; sizeKb: number; uploadedAt: string }[] }>({
    queryKey: ["/api/clinical-schema/workbooks"],
  });

  async function runValidation(file?: string) {
    const token = localStorage.getItem("app_auth_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const url = file ? `/api/clinical-schema/validate?file=${encodeURIComponent(file)}` : "/api/clinical-schema/validate";
      const res = await fetch(url, { headers, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.detail || "Validation failed");
      }
      const data = await res.json();
      setReport(data);
      toast({
        title: data.ok ? "Validation Passed" : "Issues Found",
        description: `${data.summary.issueCount} issues across ${data.summary.checkedSheets} sheets`,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Validation Failed", description: err?.message, variant: "destructive" });
    }
  }

  async function handleUploadAndValidate() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch("/api/clinical-schema/validate", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.detail || "Upload failed");
      }

      const data = await res.json();
      setReport(data);
      qc.invalidateQueries({ queryKey: ["/api/clinical-schema/workbooks"] });
      if (fileRef.current) fileRef.current.value = "";

      toast({
        title: data.ok ? "Validation Passed" : "Issues Found",
        description: `${data.summary.issueCount} issues in ${file.name}`,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const sortedSheetResults = report?.sheetResults
    ?.slice()
    .sort((a, b) => {
      const aCrit = a.issues.filter((i) => i.severity === "critical" || i.severity === "error").length;
      const bCrit = b.issues.filter((i) => i.severity === "critical" || i.severity === "error").length;
      return bCrit - aCrit;
    });

  return (
    <div className="space-y-6 max-w-6xl mx-auto" data-testid="schema-validator-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShieldCheck className="h-6 w-6" />
            Clinical Schema Validator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            4-layer validation: workbook integrity, header schemas, cross-sheet references, and data quality
          </p>
        </div>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload" className="gap-1.5" data-testid="tab-upload">
            <Upload className="h-3.5 w-3.5" />Upload & Validate
          </TabsTrigger>
          <TabsTrigger value="existing" className="gap-1.5" data-testid="tab-existing">
            <FileSpreadsheet className="h-3.5 w-3.5" />Existing Workbooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Clinical Workbook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload an .xlsx workbook to validate against the clinical schema. The validator checks for required sheets, column schemas, referential integrity, and data quality.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="max-w-sm"
                  data-testid="input-workbook-file"
                />
                <Button onClick={handleUploadAndValidate} disabled={uploading} data-testid="button-upload-validate">
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Upload & Validate
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">COMPLAINT_REGISTRY</Badge>
                <Badge variant="outline">CORE_QUESTIONS</Badge>
                <Badge variant="outline">DISPOSITION_RULES</Badge>
                <Badge variant="outline">CLUSTER_SCORING_RULES</Badge>
                <Badge variant="outline">RED_FLAG_RULES</Badge>
                <Badge variant="outline">OUTPUT_TEMPLATES</Badge>
                <Badge variant="outline">GLOBAL_SECONDARY</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="existing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Previously Uploaded Workbooks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workbooksLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : !workbooks?.files?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-workbooks">
                  No workbooks uploaded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {workbooks.files.map((f) => (
                    <div key={f.filename} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border" data-testid={`workbook-${f.filename}`}>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-xs">{f.filename}</span>
                        <span className="text-xs text-muted-foreground">{f.sizeKb} KB</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedFile(f.filename); runValidation(f.filename); }}
                        data-testid={`button-validate-${f.filename}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                        Validate
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {report && (
        <div className="space-y-4">
          <Card className={report.ok ? "border-green-300 dark:border-green-700" : "border-red-300 dark:border-red-700"}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {report.ok ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                  )}
                  <span data-testid="text-validation-status">
                    {report.ok ? "Schema Validation Passed" : "Schema Issues Found"}
                  </span>
                </div>
                {report.validatedFile && (
                  <Badge variant="outline" className="font-mono text-xs" data-testid="text-validated-file">{report.validatedFile}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Sheets</div>
                  <div className="text-2xl font-bold" data-testid="text-sheet-count">{report.summary.sheetCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Checked</div>
                  <div className="text-2xl font-bold" data-testid="text-checked-count">{report.summary.checkedSheets}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Issues</div>
                  <div className={`text-2xl font-bold ${report.summary.issueCount > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-total-issues">
                    {report.summary.issueCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Critical</div>
                  <div className={`text-2xl font-bold ${report.summary.criticalCount > 0 ? "text-red-600" : ""}`} data-testid="text-critical-count">
                    {report.summary.criticalCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                  <div className={`text-2xl font-bold ${report.summary.errorCount > 0 ? "text-orange-600" : ""}`} data-testid="text-error-count">
                    {report.summary.errorCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                  <div className={`text-2xl font-bold ${report.summary.warningCount > 0 ? "text-yellow-600" : ""}`} data-testid="text-warning-count">
                    {report.summary.warningCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Info</div>
                  <div className="text-2xl font-bold" data-testid="text-info-count">{report.summary.infoCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <h2 className="text-lg font-semibold">Sheet-by-Sheet Results</h2>
          <div className="space-y-3">
            {sortedSheetResults?.map((result) => (
              <SheetPanel
                key={result.sheet}
                result={result}
                defaultOpen={result.issues.some((i) => i.severity === "critical" || i.severity === "error")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
