import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GitCommit, Rocket, RotateCcw } from "lucide-react";

function statusVariant(status: string) {
  if (status === "deployed") return "default" as const;
  if (status === "rolled_back") return "destructive" as const;
  if (status === "reviewed") return "secondary" as const;
  return "outline" as const;
}

interface VersionListProps {
  versions: any[];
  onDeploy: (id: string) => void;
  onRollback: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
  deploying?: boolean;
}

export default function VersionList({ versions, onDeploy, onRollback, onSelect, selectedId, deploying }: VersionListProps) {
  if (!versions?.length) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="text-no-versions">
        No clinical versions created yet. Versions are created when clinical data sheets are ingested.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {versions.map((v: any) => (
        <Card
          key={v.id}
          className={`cursor-pointer transition-colors ${selectedId === v.id ? "border-primary" : ""}`}
          onClick={() => onSelect(v.id)}
          data-testid={`version-card-${v.id}`}
        >
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-sm font-medium" data-testid={`version-id-${v.id}`}>
                    {v.id}
                  </span>
                  <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                </div>
                {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{new Date(v.createdAt).toLocaleString()}</span>
                  <span>by {v.createdBy}</span>
                  {v.sheetFiles?.length > 0 && <span>{v.sheetFiles.length} sheets</span>}
                </div>
                {v.changeSummary && (
                  <div className="flex gap-2 mt-1">
                    {v.changeSummary.added > 0 && (
                      <Badge variant="outline" className="text-xs text-green-600">+{v.changeSummary.added} added</Badge>
                    )}
                    {v.changeSummary.removed > 0 && (
                      <Badge variant="outline" className="text-xs text-red-600">-{v.changeSummary.removed} removed</Badge>
                    )}
                    {v.changeSummary.modified > 0 && (
                      <Badge variant="outline" className="text-xs text-yellow-600">~{v.changeSummary.modified} modified</Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {v.status !== "deployed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deploying}
                    onClick={(e) => { e.stopPropagation(); onDeploy(v.id); }}
                    data-testid={`button-deploy-version-${v.id}`}
                  >
                    <Rocket className="w-3 h-3 mr-1" />Deploy
                  </Button>
                )}
                {v.status === "rolled_back" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deploying}
                    onClick={(e) => { e.stopPropagation(); onRollback(v.id); }}
                    data-testid={`button-rollback-version-${v.id}`}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />Restore
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
