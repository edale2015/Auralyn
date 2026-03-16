import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock } from "lucide-react";

interface VersionRollbackPanelProps {
  deploymentInfo: any;
}

export default function VersionRollbackPanel({ deploymentInfo }: VersionRollbackPanelProps) {
  if (!deploymentInfo) return null;

  return (
    <Card data-testid="rollback-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-5 h-5" />Deployment Status
        </CardTitle>
        <CardDescription>Current deployment and available rollback targets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {deploymentInfo.currentVersion ? (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-800 dark:text-green-200" data-testid="text-current-deployed">
              Deployed: {deploymentInfo.currentVersion}
            </p>
            {deploymentInfo.currentDescription && (
              <p className="text-xs text-green-600 dark:text-green-400">{deploymentInfo.currentDescription}</p>
            )}
            {deploymentInfo.deployedAt && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Since {new Date(deploymentInfo.deployedAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200" data-testid="text-no-deployment">
              No version currently deployed
            </p>
          </div>
        )}

        {deploymentInfo.availableRollbacks?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Available Rollback Targets ({deploymentInfo.availableRollbacks.length})
            </p>
            <div className="space-y-1">
              {deploymentInfo.availableRollbacks.map((rb: any) => (
                <div key={rb.id} className="flex items-center gap-2 text-xs p-2 rounded border">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono">{rb.id}</span>
                  <span className="text-muted-foreground">{rb.description}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {new Date(rb.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
