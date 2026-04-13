import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, AlertTriangle, BarChart3, ShieldCheck, FileText } from "lucide-react";

interface ValidationResult {
  n: number;
  durationMs: number;
  metrics: {
    totalCases: number;
    sensitivity: number;
    specificity: number;
    accuracy: number;
    falseNegativeRate: number;
    falsePositiveRate: number;
    ppv: number;
    npv: number;
    confusionMatrix: { TP: number; TN: number; FP: number; FN: number };
  };
  summary: string;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function MetricBar({ label, value, threshold, danger }: { label: string; value: number; threshold?: number; danger?: boolean }) {
  const pctVal = Math.round(value * 100);
  const fails = threshold !== undefined && value < threshold;
  return (
    <div className="space-y-1" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex justify-between text-sm">
        <span className={fails ? "text-red-600 font-medium" : "text-foreground"}>{label}</span>
        <span className={`font-mono font-semibold ${fails ? "text-red-600" : danger ? "text-orange-500" : "text-green-600"}`}>
          {pct(value)} {fails && "❌"} {!fails && threshold !== undefined && "✅"}
        </span>
      </div>
      <Progress
        value={pctVal}
        className={`h-2 ${fails ? "[&>div]:bg-red-500" : danger ? "[&>div]:bg-orange-400" : "[&>div]:bg-green-500"}`}
      />
      {threshold !== undefined && (
        <div className="text-xs text-muted-foreground">Threshold: {pct(threshold)}</div>
      )}
    </div>
  );
}

export default function ValidationDashboard() {
  const { data, isLoading, error } = useQuery<ValidationResult>({
    queryKey: ["/api/validation/run"],
  });

  const { data: dossier, isLoading: dossierLoading } = useQuery<any>({
    queryKey: ["/api/validation/dossier"],
  });

  const passes = data ? data.metrics.sensitivity >= 0.90 : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Clinical Validation Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">FDA SaMD Class IIa performance metrics · Live synthetic cohort evaluation</p>
      </div>

      {/* Pass/Fail Banner */}
      {!isLoading && data && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg border-2 ${passes ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700" : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"}`}
          data-testid="pass-fail-banner"
        >
          {passes
            ? <CheckCircle2 size={22} className="text-green-600 flex-shrink-0" />
            : <XCircle size={22} className="text-red-600 flex-shrink-0" />
          }
          <div>
            <div className={`font-semibold ${passes ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
              {passes ? "DEPLOYMENT CLEARED — ER_NOW sensitivity meets 90% threshold" : "DEPLOYMENT BLOCKED — ER_NOW sensitivity below 90% threshold"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {data.n.toLocaleString()} synthetic cases · {data.durationMs}ms runtime
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Performance Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={16} />
              Performance Metrics
            </CardTitle>
            <CardDescription>Binary classification — ER_NOW as positive class</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm" data-testid="metrics-loading">Loading…</div>
            ) : error ? (
              <div className="text-red-500 text-sm" data-testid="metrics-error">Failed to load metrics</div>
            ) : data ? (
              <>
                <MetricBar label="Sensitivity (ER_NOW recall)" value={data.metrics.sensitivity} threshold={0.90} />
                <MetricBar label="Specificity" value={data.metrics.specificity} />
                <MetricBar label="Accuracy" value={data.metrics.accuracy} />
                <MetricBar label="False Negative Rate" value={data.metrics.falseNegativeRate} danger={data.metrics.falseNegativeRate > 0.10} />
                <MetricBar label="PPV" value={data.metrics.ppv} />
                <MetricBar label="NPV" value={data.metrics.npv} />
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Confusion Matrix */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} />
              Confusion Matrix
            </CardTitle>
            <CardDescription>ER_NOW detection outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : data ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                {[
                  { label: "True Positive",  key: "TP", value: data.metrics.confusionMatrix.TP, cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300", desc: "Correctly caught ER cases" },
                  { label: "False Negative", key: "FN", value: data.metrics.confusionMatrix.FN, cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",   desc: "Missed ER cases (critical!)" },
                  { label: "False Positive", key: "FP", value: data.metrics.confusionMatrix.FP, cls: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300", desc: "Over-triaged non-ER cases" },
                  { label: "True Negative",  key: "TN", value: data.metrics.confusionMatrix.TN, cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300", desc: "Correctly cleared non-ER" },
                ].map(({ label, key, value, cls, desc }) => (
                  <div key={key} className={`rounded-lg p-3 ${cls}`} data-testid={`confusion-${key.toLowerCase()}`}>
                    <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* FDA Dossier Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText size={16} />
            FDA SaMD Dossier Preview
          </CardTitle>
          <CardDescription>510(k)-aligned Software as a Medical Device documentation</CardDescription>
        </CardHeader>
        <CardContent>
          {dossierLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm" data-testid="dossier-loading">Generating dossier…</div>
          ) : dossier ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Device Name</div>
                  <div className="font-medium" data-testid="dossier-device-name">{dossier.deviceName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Classification</div>
                  <div className="font-medium">{dossier.classification}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Risk Class</div>
                  <Badge variant="outline" data-testid="dossier-risk-class">{dossier.riskAnalysis.riskClass}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Validation</div>
                  <Badge className={dossier.validationSummary.passed ? "bg-green-500" : "bg-red-500"} data-testid="dossier-validation-status">
                    {dossier.validationSummary.passed ? "PASSED" : "FAILED"}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Risk Mitigation Strategy</div>
                <p className="text-sm" data-testid="dossier-mitigation">{dossier.riskAnalysis.mitigationStrategy}</p>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Regulatory Notes</div>
                <ul className="space-y-1">
                  {dossier.regulatoryNotes.map((note: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid={`regulatory-note-${i}`}>
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
