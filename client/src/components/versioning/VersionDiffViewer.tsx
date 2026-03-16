import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitCompare, Plus, Minus, Pencil, FileSpreadsheet } from "lucide-react";

interface VersionDiffViewerProps {
  fromId: string;
  toId: string;
}

export default function VersionDiffViewer({ fromId, toId }: VersionDiffViewerProps) {
  const { data: diff, isLoading } = useQuery<any>({
    queryKey: ["/api/clinical-versions/diff", fromId, toId],
    enabled: !!fromId && !!toId && fromId !== toId,
  });

  if (!fromId || !toId || fromId === toId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="w-5 h-5" />Version Diff
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-select-versions-diff">
            Select two different versions from the list to compare changes
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Card><CardContent className="pt-6"><p className="text-muted-foreground">Loading diff...</p></CardContent></Card>;
  }

  if (!diff) {
    return <Card><CardContent className="pt-6"><p className="text-muted-foreground">Unable to compute diff</p></CardContent></Card>;
  }

  return (
    <Card data-testid="version-diff-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="w-5 h-5" />Version Diff
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{diff.from}</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant="outline">{diff.to}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 text-center">
            <Plus className="w-4 h-4 mx-auto text-green-600 mb-1" />
            <span className="text-lg font-bold text-green-700 dark:text-green-300" data-testid="diff-added">{diff.added}</span>
            <p className="text-xs text-green-600">Added</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-center">
            <Minus className="w-4 h-4 mx-auto text-red-600 mb-1" />
            <span className="text-lg font-bold text-red-700 dark:text-red-300" data-testid="diff-removed">{diff.removed}</span>
            <p className="text-xs text-red-600">Removed</p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-center">
            <Pencil className="w-4 h-4 mx-auto text-yellow-600 mb-1" />
            <span className="text-lg font-bold text-yellow-700 dark:text-yellow-300" data-testid="diff-modified">{diff.modified}</span>
            <p className="text-xs text-yellow-600">Modified</p>
          </div>
        </div>

        <div className="flex gap-2">
          {diff.sheetsChanged && <Badge variant="destructive" className="text-xs">Sheets Changed</Badge>}
          {diff.graphChanged && <Badge variant="destructive" className="text-xs">Graph Changed</Badge>}
          {!diff.sheetsChanged && !diff.graphChanged && <Badge variant="secondary" className="text-xs">No structural changes</Badge>}
        </div>

        {diff.affectedSheets?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Affected Sheets</p>
            <div className="flex flex-wrap gap-1">
              {diff.affectedSheets.map((sheet: string) => (
                <Badge key={sheet} variant="outline" className="text-xs">
                  <FileSpreadsheet className="w-3 h-3 mr-1" />{sheet}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
