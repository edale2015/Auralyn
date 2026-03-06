import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Props = {
  caseId: string;
};

export function ExportPanel({ caseId }: Props) {
  const queryClient = useQueryClient();

  const { data: status, isLoading, error: statusError } = useQuery<any>({
    queryKey: ["/api/exportEncounter", caseId, "status"],
    enabled: !!caseId,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/exportEncounter/${caseId}/export`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exportEncounter", caseId, "status"] });
    },
  });

  const canExport =
    status &&
    (!status.signoffRequired ||
      status.reviewStatus === "APPROVED" ||
      status.reviewStatus === "OVERRIDDEN");

  const alreadyExported = status?.exportedToEcw === true;

  if (isLoading) {
    return (
      <Card data-testid="panel-export">
        <CardContent className="pt-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (statusError) {
    return (
      <Card data-testid="panel-export">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            eCW Sidecar Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive" data-testid="text-status-error">
            Failed to load export status.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="panel-export">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4" />
          eCW Sidecar Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div>
              Review status:{" "}
              <Badge variant="outline" className="text-[10px]" data-testid="badge-review-status">
                {status.reviewStatus ?? "—"}
              </Badge>
            </div>
            <div>
              Case status:{" "}
              <Badge variant="outline" className="text-[10px]" data-testid="badge-case-status">
                {status.status ?? "—"}
              </Badge>
            </div>
            <div>
              Exported:{" "}
              <Badge
                variant={alreadyExported ? "default" : "secondary"}
                className="text-[10px]"
                data-testid="badge-exported"
              >
                {alreadyExported ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
        )}

        {!canExport && status?.signoffRequired && (
          <div className="flex items-center gap-1.5 text-xs text-destructive" data-testid="text-export-blocked">
            <AlertTriangle className="h-3 w-3" />
            This case must be signed off before export.
          </div>
        )}

        <Button
          size="sm"
          onClick={() => exportMutation.mutate()}
          disabled={!canExport || exportMutation.isPending}
          data-testid="button-export"
        >
          {exportMutation.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Download className="mr-1 h-3 w-3" />
          )}
          Export Encounter Bundle
        </Button>

        {exportMutation.isSuccess && (
          <div className="text-sm text-green-600 flex items-center gap-1.5" data-testid="text-export-success">
            <CheckCircle className="h-3 w-3" />
            Export bundle generated successfully.
          </div>
        )}

        {exportMutation.error && (
          <div className="text-sm text-destructive" data-testid="text-export-error">
            {String(exportMutation.error)}
          </div>
        )}

        {exportMutation.data && (
          <div className="text-xs text-muted-foreground space-y-0.5" data-testid="text-export-paths">
            <div>Directory: <span className="font-mono">{(exportMutation.data as any).exportDir}</span></div>
            <div>Text: <span className="font-mono">{(exportMutation.data as any).textPath}</span></div>
            <div>JSON: <span className="font-mono">{(exportMutation.data as any).jsonPath}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
