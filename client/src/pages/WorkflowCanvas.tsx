import { useCallback } from "react";
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
  { id: "1", position: { x: 50,  y: 80  }, data: { label: "⚡ Fast Triage" },    style: { background: "#1e3a5f", color: "#fff", border: "1px solid #3b82f6", borderRadius: 8 } },
  { id: "2", position: { x: 280, y: 80  }, data: { label: "🧠 Full Triage" },    style: { background: "#1e3a5f", color: "#fff", border: "1px solid #3b82f6", borderRadius: 8 } },
  { id: "3", position: { x: 510, y: 80  }, data: { label: "💰 Bill" },            style: { background: "#14532d", color: "#fff", border: "1px solid #22c55e", borderRadius: 8 } },
  { id: "4", position: { x: 740, y: 80  }, data: { label: "🏥 Send Hospital" },  style: { background: "#4c1d95", color: "#fff", border: "1px solid #a78bfa", borderRadius: 8 } },
];

export default function WorkflowCanvas() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { toast } = useToast();

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  async function save() {
    try {
      await fetch("/api/workflows/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      toast({ title: "Workflow saved", description: `${nodes.length} nodes, ${edges.length} edges.` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg">🎛️ Workflow Canvas</h1>
        <button
          onClick={save}
          data-testid="button-save-workflow"
          className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded font-medium"
        >
          💾 Save Workflow
        </button>
      </div>
      <div className="flex-1">
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
      </div>
    </div>
  );
}
