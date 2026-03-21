// ARCHIVED — Phase 4 Step 21 cleanup
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

export default function DecisionGraphHeatmaps() {
  return (
    <div className="p-6 space-y-4" data-testid="page-decision-graph-heatmaps">
      <div className="flex items-center gap-3"><GitBranch className="h-5 w-5" /><h2 className="text-xl font-semibold">Decision Graph Heatmaps</h2></div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Node Frequency Heatmap</CardTitle></CardHeader><CardContent>
        <p className="text-sm text-muted-foreground" data-testid="text-info">Heatmap visualization shows node traversal frequencies. Data populates as cases are processed through the engine.</p>
      </CardContent></Card>
    </div>
  );
}
