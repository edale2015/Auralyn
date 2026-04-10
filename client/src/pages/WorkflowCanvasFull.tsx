import { useCallback, useState } from "react";
import ReactFlow, {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  Background,
  Controls,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { useToast } from "@/hooks/use-toast";

const initialNodes = [
  { id: "start", position: { x: 50, y: 50 }, data: { label: "🚀 Start" }, style: { background: "#1e3a5f", color: "#fff", border: "1px solid #3b82f6", borderRadius: 8 } },
];

export default function WorkflowCanvasFull() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const { toast } = useToast();

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  async function save() {
    try {
      const res = await fetch("/api/workflows/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      const data = await res.json();
      toast({ title: "Workflow saved", description: `${nodes.length} nodes · ${edges.length} edges` });
      return data;
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  async function exportGraph() {
    const res = await fetch("/api/workflows/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes, edges, startId: nodes[0]?.id }),
    });
    const g = await res.json();
    setGraph(g);
    toast({ title: "Graph exported", description: `${Object.keys(g).length} nodes mapped` });
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-900 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg mr-auto">🧩 Full Workflow Canvas</h1>
        <button
          onClick={exportGraph}
          data-testid="button-export-graph"
          className="px-3 py-1.5 bg-yellow-800 hover:bg-yellow-700 text-white text-xs rounded font-medium"
        >
          📐 Export Graph
        </button>
        <button
          onClick={save}
          data-testid="button-save-full-workflow"
          className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded font-medium"
        >
          💾 Save
        </button>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background color="#374151" gap={16} />
          <Controls />
          <MiniMap nodeColor="#3b82f6" />
        </ReactFlow>

        {graph && (
          <div className="absolute bottom-4 left-4 right-4 max-h-40 overflow-auto bg-gray-900 border border-gray-700 rounded-lg p-3" data-testid="graph-export-preview">
            <p className="text-xs text-gray-400 mb-1 font-mono">Execution Graph ({Object.keys(graph).length} nodes)</p>
            <pre className="text-xs text-green-300">{JSON.stringify(graph, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
