import { ENGINE_REGISTRY, ARCHITECTURE_LAYERS, getEngineStats } from './engineRegistry';

export type DiagramFormat = 'mermaid' | 'ascii' | 'json' | 'dot';

export interface DiagramResult {
  format: DiagramFormat;
  content: string;
  engineCount: number;
  layerCount: number;
  generatedAt: string;
}

const LAYER_ORDER = [
  'input', 'integrity', 'evidence', 'hypothesis',
  'reasoning', 'planning', 'governance', 'action',
  'learning', 'simulation', 'advanced', 'coordination',
];

export function architectureDiagramEngine(format: DiagramFormat = 'mermaid'): DiagramResult {
  const stats = getEngineStats();

  let content: string;

  switch (format) {
    case 'mermaid':
      content = buildMermaid();
      break;
    case 'ascii':
      content = buildAscii();
      break;
    case 'dot':
      content = buildDot();
      break;
    case 'json':
      content = JSON.stringify(buildJson(), null, 2);
      break;
    default:
      content = buildMermaid();
  }

  return {
    format,
    content,
    engineCount: stats.total,
    layerCount: LAYER_ORDER.length,
    generatedAt: new Date().toISOString(),
  };
}

function buildMermaid(): string {
  const lines: string[] = ['graph TD'];

  lines.push('  PatientInput([🏥 Patient Input])');

  LAYER_ORDER.forEach((layer, i) => {
    const info = ARCHITECTURE_LAYERS.find((l) => l.layer === layer);
    const engines = ENGINE_REGISTRY.filter((e) => e.layer === layer);
    const layerLabel = info?.label ?? layer;
    const engineList = engines.slice(0, 3).map((e) => e.label).join(', ');
    const truncated = engines.length > 3 ? `${engineList} +${engines.length - 3} more` : engineList;
    const layerId = `L${i}_${layer}`;

    if (layer === 'coordination') {
      lines.push(`  ${layerId}[[🧠 ${layerLabel}<br/>${truncated}]]`);
    } else if (layer === 'governance') {
      lines.push(`  ${layerId}{⚖️ ${layerLabel}<br/>${truncated}}`);
    } else if (layer === 'simulation') {
      lines.push(`  ${layerId}([🧪 ${layerLabel}<br/>${truncated}])`);
    } else {
      lines.push(`  ${layerId}[${layerLabel}<br/>${truncated}]`);
    }
  });

  // ── Chain layers ──────────────────────────────────────────────────────────
  lines.push(`  PatientInput --> L0_input`);
  LAYER_ORDER.forEach((layer, i) => {
    if (i < LAYER_ORDER.length - 1) {
      const from = `L${i}_${layer}`;
      const to = `L${i + 1}_${LAYER_ORDER[i + 1]}`;
      lines.push(`  ${from} --> ${to}`);
    }
  });

  // ── Learning feedback loop ────────────────────────────────────────────────
  const coordIdx = LAYER_ORDER.indexOf('coordination');
  const learningIdx = LAYER_ORDER.indexOf('learning');
  lines.push(`  L${coordIdx}_coordination -.->|feedback loop| L${learningIdx}_learning`);

  lines.push('');
  lines.push('  style PatientInput fill:#4f46e5,color:#fff');
  lines.push(`  style L${LAYER_ORDER.indexOf('governance')}_governance fill:#ef4444,color:#fff`);
  lines.push(`  style L${LAYER_ORDER.indexOf('coordination')}_coordination fill:#7c3aed,color:#fff`);

  return lines.join('\n');
}

function buildAscii(): string {
  const lines: string[] = [];
  lines.push('ENT Flu Slice — Clinical Intelligence Architecture');
  lines.push('═'.repeat(52));
  lines.push('');
  lines.push('  PATIENT INPUT');
  lines.push('       │');

  LAYER_ORDER.forEach((layer, i) => {
    const info = ARCHITECTURE_LAYERS.find((l) => l.layer === layer);
    const engines = ENGINE_REGISTRY.filter((e) => e.layer === layer);
    const label = info?.label ?? layer;
    lines.push(`  ┌─────────────────────────────────────────────┐`);
    lines.push(`  │  ${label.padEnd(42)} │  (${engines.length} engines)`);
    engines.slice(0, 4).forEach((e) => {
      lines.push(`  │    ├ ${e.label}`);
    });
    if (engines.length > 4) lines.push(`  │    └ ... +${engines.length - 4} more`);
    lines.push(`  └─────────────────────────────────────────────┘`);
    if (i < LAYER_ORDER.length - 1) lines.push('       │');
  });

  lines.push('');
  lines.push(`  Total: ${ENGINE_REGISTRY.length} engines across ${LAYER_ORDER.length} layers`);
  return lines.join('\n');
}

function buildDot(): string {
  const lines: string[] = ['digraph ClinicalArchitecture {', '  rankdir=TB;', '  node [shape=box, style=filled, fillcolor=lightblue];'];

  lines.push('  PatientInput [label="Patient Input", shape=oval, fillcolor="#4f46e5", fontcolor=white];');

  LAYER_ORDER.forEach((layer, i) => {
    const engines = ENGINE_REGISTRY.filter((e) => e.layer === layer);
    const info = ARCHITECTURE_LAYERS.find((l) => l.layer === layer);
    const layerId = `layer_${layer}`;
    lines.push(`  ${layerId} [label="${info?.label ?? layer}\\n(${engines.length} engines)", fillcolor="${info?.color ?? '#888'}", fontcolor=white];`);
  });

  lines.push('  PatientInput -> layer_input;');
  LAYER_ORDER.forEach((layer, i) => {
    if (i < LAYER_ORDER.length - 1) {
      lines.push(`  layer_${layer} -> layer_${LAYER_ORDER[i + 1]};`);
    }
  });
  lines.push('  layer_coordination -> layer_learning [style=dashed, label="feedback"];');
  lines.push('}');
  return lines.join('\n');
}

function buildJson() {
  return {
    architecture: 'ENT Flu Slice Clinical Intelligence Platform',
    version: '10.0',
    generatedAt: new Date().toISOString(),
    stats: getEngineStats(),
    layers: LAYER_ORDER.map((layer) => {
      const info = ARCHITECTURE_LAYERS.find((l) => l.layer === layer);
      const engines = ENGINE_REGISTRY.filter((e) => e.layer === layer);
      return {
        id: layer,
        label: info?.label,
        color: info?.color,
        description: info?.description,
        engines: engines.map((e) => ({ id: e.id, label: e.label, status: e.status, file: e.file })),
      };
    }),
  };
}
