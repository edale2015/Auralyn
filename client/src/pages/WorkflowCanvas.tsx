import { useCallback } from "react";
import ReactFlow, {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  Background,
  Controls,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { useToast } from "@/hooks/use-toast";

const stepStyle  = { background: "#1e3a5f", color: "#fff", border: "1px solid #3b82f6", borderRadius: 8 };
const condStyle  = { background: "#451a03", color: "#fff", border: "1px solid #f59e0b", borderRadius: 8 };
const billStyle  = { background: "#14532d", color: "#fff", border: "1px solid #22c55e", borderRadius: 8 };
const hospStyle  = { background: "#4c1d95", color: "#fff", border: "1px solid #a78bfa", borderRadius: 8 };

const initialNodes: Node[] = [
  { id: "1", position: { x: 50,  y: 80 }, data: { label: "⚡ Fast Triage" },   style: stepStyle },
  { id: "2", position: { x: 280, y: 80 }, data: { label: "🧠 Full Triage" },   style: stepStyle },
  { id: "3", position: { x: 510, y: 80 }, data: { label: "💰 Bill" },           style: billStyle },
  { id: "4", position: { x: 740, y: 80 }, data: { label: "🏥 Send Hospital" }, style: hospStyle },
];

export default function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { toast } = useToast();

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  function addCondition() {
    const id = Date.now().toString();
    setNodes(prev => [
      ...prev,
      {
        id,
        position: { x: 200, y: 220 },
        data: {
          label: "🔀 IF risk == high",
          condition: { field: "risk", equals: "high" },
        },
        style: condStyle,
      },
    ]);
  }

  function addStepNode(name: string, label: string) {
    const id = Date.now().toString();
    setNodes(prev => [
      ...prev,
      { id, position: { x: 100 + prev.length * 80, y: 320 }, data: { label }, style: stepStyle },
    ]);
    toast({ title: `Added: ${name}`, description: "Connect it to your workflow." });
  }

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
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-900 border-b border-gray-800 flex-wrap">
        <h1 className="text-white font-bold text-lg mr-auto">🎛️ Workflow Canvas</h1>

        <button
          onClick={addCondition}
          data-testid="button-add-condition"
          className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-xs rounded font-medium"
        >
          🔀 + Condition
        </button>
        <button
          onClick={() => addStepNode("fastTriage", "⚡ Fast Triage")}
          data-testid="button-add-node-fastTriage"
          className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-xs rounded font-medium"
        >
          + Fast Triage
        </button>
        <button
          onClick={() => addStepNode("bill", "💰 Bill")}
          data-testid="button-add-node-bill"
          className="px-3 py-1.5 bg-green-800 hover:bg-green-700 text-white text-xs rounded font-medium"
        >
          + Bill
        </button>
        <button
          onClick={save}
          data-testid="button-save-workflow"
          className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded font-medium"
        >
          💾 Save
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
