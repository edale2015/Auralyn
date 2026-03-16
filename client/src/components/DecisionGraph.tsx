import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CaseReplay } from './ReplayTimeline';

interface DecisionGraphProps {
  replay: CaseReplay;
  height?: number;
}

const LAYER_COLORS: Record<string, string> = {
  'L1': '#6366f1',
  'L2': '#ef4444',
  'L3': '#3b82f6',
  'L4': '#8b5cf6',
  'L5': '#f59e0b',
  'L6': '#14b8a6',
  'L7': '#22c55e',
  'L8': '#0ea5e9',
  'L9': '#64748b',
};

function layerColor(layer?: string): string {
  if (!layer) return '#6366f1';
  const prefix = layer.slice(0, 2);
  return LAYER_COLORS[prefix] ?? '#6366f1';
}

function confidenceBg(confidence?: number): string {
  if (!confidence) return 'rgba(99,102,241,0.15)';
  if (confidence >= 0.85) return 'rgba(34,197,94,0.15)';
  if (confidence >= 0.65) return 'rgba(245,158,11,0.15)';
  return 'rgba(239,68,68,0.15)';
}

export default function DecisionGraph({ replay, height = 460 }: DecisionGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const stepsPerRow = 3;
    const colGap = 260;
    const rowGap = 140;

    const nodes: Node[] = replay.steps.map((step, i) => {
      const col = i % stepsPerRow;
      const row = Math.floor(i / stepsPerRow);
      const xOffset = row % 2 === 1 ? colGap * (stepsPerRow - 1) - col * colGap : col * colGap;
      const confPct = step.confidence ? `${Math.round(step.confidence * 100)}%` : '';

      return {
        id: `step_${i}`,
        position: { x: 40 + xOffset, y: 40 + row * rowGap },
        data: {
          label: (
            <div style={{ textAlign: 'center', padding: '4px 2px' }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2 }}>{step.engine.replace(' Engine', '')}</div>
              {step.layer && <div style={{ fontSize: 9, opacity: 0.75 }}>{step.layer}</div>}
              {confPct && <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>{confPct}</div>}
            </div>
          ),
        },
        style: {
          background: confidenceBg(step.confidence),
          border: `2px solid ${layerColor(step.layer)}`,
          borderRadius: 10,
          color: '#f8fafc',
          width: 180,
          fontSize: 11,
        },
      };
    });

    // Add final disposition node if present
    if (replay.finalDisposition) {
      const lastRow = Math.floor((replay.steps.length - 1) / stepsPerRow);
      nodes.push({
        id: 'disposition',
        position: { x: 200, y: 40 + (lastRow + 1) * rowGap },
        data: {
          label: (
            <div style={{ textAlign: 'center', padding: '4px 2px' }}>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 2 }}>DISPOSITION</div>
              <div style={{ fontSize: 10 }}>{replay.finalDisposition.slice(0, 50)}</div>
            </div>
          ),
        },
        style: {
          background: 'rgba(14,165,233,0.2)',
          border: '2px solid #0ea5e9',
          borderRadius: 10,
          color: '#f8fafc',
          width: 220,
          fontSize: 11,
        },
      });
    }

    // Build sequential edges
    const edges: Edge[] = replay.steps.slice(0, -1).map((_, i) => ({
      id: `e_${i}_${i + 1}`,
      source: `step_${i}`,
      target: `step_${i + 1}`,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    }));

    // Last step → disposition
    if (replay.finalDisposition && replay.steps.length > 0) {
      edges.push({
        id: `e_last_disp`,
        source: `step_${replay.steps.length - 1}`,
        target: 'disposition',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9' },
        style: { stroke: '#0ea5e9', strokeWidth: 2.5 },
      });
    }

    return { nodes, edges };
  }, [replay]);

  return (
    <div style={{ height, width: '100%' }} className="rounded-xl overflow-hidden border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        attributionPosition="bottom-right"
      >
        <Background gap={20} color="#1e293b" />
        <Controls className="bg-card border-border" />
        <MiniMap
          nodeColor={(n) => {
            const bg = (n.style?.border as string) ?? '#6366f1';
            return bg.replace('2px solid ', '');
          }}
          maskColor="rgba(0,0,0,0.5)"
          className="bg-card border-border"
        />
      </ReactFlow>
    </div>
  );
}
