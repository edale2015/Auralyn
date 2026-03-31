import Tree from "react-d3-tree";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";

export interface TreeNode {
  id?: string;
  name: string;
  type?: "question" | "finding" | "rule" | "dx" | "action" | "root";
  attributes?: Record<string, string>;
  children?: TreeNode[];
}

interface Props {
  tree: TreeNode;
  engineSource?: string;
  featureModelRows?: number;
  uniqueRules?: number;
}

const TYPE_COLORS: Record<string, string> = {
  root: "#6366f1",
  rule: "#8b5cf6",
  dx: "#059669",
  finding: "#0ea5e9",
  question: "#f59e0b",
  action: "#ef4444",
};

function renderNodeShape({ nodeDatum }: any) {
  const type = (nodeDatum as any).type || "rule";
  const color = TYPE_COLORS[type] || "#6b7280";
  const isLeaf = !nodeDatum.children || nodeDatum.children.length === 0;
  const r = isLeaf ? 10 : 14;

  return (
    <g>
      <circle r={r} fill={color} stroke="#fff" strokeWidth={2} opacity={0.9} />
      <text
        fill="#1e293b"
        strokeWidth={0}
        x={18}
        y={-8}
        style={{ fontSize: "11px", fontWeight: 600 }}
      >
        {nodeDatum.name}
      </text>
      {nodeDatum.attributes &&
        Object.entries(nodeDatum.attributes as Record<string, string>)
          .slice(0, 2)
          .map(([k, v], i) => (
            <text
              key={k}
              fill="#64748b"
              strokeWidth={0}
              x={18}
              y={6 + i * 13}
              style={{ fontSize: "9px" }}
            >
              {k}: {v}
            </text>
          ))}
    </g>
  );
}

export default function DecisionTreeViz({ tree, engineSource, featureModelRows, uniqueRules }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge variant="outline" className="gap-1 text-xs">
          <Database className="h-3 w-3" />
          {engineSource ?? "KB_DB"}
        </Badge>
        {featureModelRows != null && (
          <Badge variant="secondary" className="text-xs">{featureModelRows} feature rows</Badge>
        )}
        {uniqueRules != null && (
          <Badge variant="secondary" className="text-xs">{uniqueRules} rules</Badge>
        )}
        <div className="flex gap-1 ml-auto">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <span key={t} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              {t}
            </span>
          ))}
        </div>
      </div>
      <div
        className="flex-1 rounded-lg border bg-slate-50 dark:bg-slate-900 overflow-hidden"
        style={{ minHeight: 440 }}
        data-testid="decision-tree-container"
      >
        <Tree
          data={tree as any}
          orientation="vertical"
          renderCustomNodeElement={renderNodeShape}
          pathFunc="step"
          translate={{ x: 480, y: 60 }}
          separation={{ siblings: 1.5, nonSiblings: 2 }}
          zoom={0.7}
          collapsible
          zoomable
          draggable
        />
      </div>
    </div>
  );
}
