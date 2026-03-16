import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface ReasoningGraphProps {
  nodes?: Node[];
  edges?: Edge[];
  complaint?: string;
  height?: number;
}

function buildDefaultGraph(complaint: string): { nodes: Node[]; edges: Edge[] } {
  const steps = [
    { id: 'input',        label: 'Patient Input',        color: '#3b82f6' },
    { id: 'normalize',    label: 'Normalization',         color: '#8b5cf6' },
    { id: 'evidence',     label: 'Evidence Retrieval',    color: '#6366f1' },
    { id: 'risk',         label: 'Risk Stratification',   color: '#f59e0b' },
    { id: 'differential', label: 'Differential Dx',       color: '#ec4899' },
    { id: 'temporal',     label: 'Temporal Analysis',     color: '#14b8a6' },
    { id: 'consensus',    label: 'Consensus Engine',      color: '#22c55e' },
    { id: 'disposition',  label: 'Disposition Decision',  color: '#ef4444' },
  ];

  const nodes: Node[] = steps.map((s, i) => ({
    id: s.id,
    position: { x: 100 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 140 },
    data: { label: s.label },
    style: {
      background: s.color,
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      padding: '10px 16px',
      fontWeight: 600,
      fontSize: 13,
      minWidth: 160,
      textAlign: 'center' as const,
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    },
  }));

  const pairs: [string, string][] = [
    ['input', 'normalize'],
    ['normalize', 'evidence'],
    ['evidence', 'risk'],
    ['risk', 'differential'],
    ['differential', 'temporal'],
    ['temporal', 'consensus'],
    ['consensus', 'disposition'],
  ];

  const edges: Edge[] = pairs.map(([s, t]) => ({
    id: `${s}-${t}`,
    source: s,
    target: t,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    style: { stroke: '#94a3b8', strokeWidth: 2 },
  }));

  if (complaint) {
    nodes.unshift({
      id: 'complaint',
      position: { x: 320, y: -60 },
      data: { label: `Complaint: ${complaint}` },
      style: {
        background: '#1e293b',
        color: '#f8fafc',
        border: '2px solid #3b82f6',
        borderRadius: 8,
        padding: '8px 16px',
        fontWeight: 700,
        fontSize: 12,
      },
    });
    edges.unshift({
      id: 'complaint-input',
      source: 'complaint',
      target: 'input',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      style: { stroke: '#3b82f6', strokeWidth: 2.5 },
    });
  }

  return { nodes, edges };
}

export default function ReasoningGraph({ nodes: propNodes, edges: propEdges, complaint = '', height = 440 }: ReasoningGraphProps) {
  const defaultGraph = useMemo(() => buildDefaultGraph(complaint), [complaint]);

  const [nodes, , onNodesChange] = useNodesState(propNodes ?? defaultGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(propEdges ?? defaultGraph.edges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <div style={{ height, width: '100%' }} className="rounded-lg overflow-hidden border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        attributionPosition="bottom-right"
      >
        <Background gap={20} color="#334155" />
        <Controls className="bg-card border-border" />
        <MiniMap
          nodeColor={(n) => (n.style?.background as string) ?? '#8b5cf6'}
          maskColor="rgba(0,0,0,0.4)"
          className="bg-card border-border"
        />
      </ReactFlow>
    </div>
  );
}
