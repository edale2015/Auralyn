import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { architectureDiagramEngine, type DiagramFormat } from '../core/architectureDiagramEngine';
import { clinicalDecisionVisualization } from '../core/clinicalDecisionVisualization';
import { clinicalPathVisualizer, toMermaidFormat } from '../core/clinicalPathVisualizer';
import type { DifferentialScore } from '../../shared/clinicalEngineTypes';

export const clinicalVisualizationRouter = Router();

// ── Architecture Diagram ──────────────────────────────────────────────────────
clinicalVisualizationRouter.get('/architecture', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const format = (req.query.format as DiagramFormat) ?? 'mermaid';
    const result = architectureDiagramEngine(format);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Complaint Pathway Diagram ─────────────────────────────────────────────────
clinicalVisualizationRouter.get('/pathway/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const complaint = req.params.complaint;
    const mermaid = buildComplaintPathway(complaint);
    res.json({ complaint, format: 'mermaid', content: mermaid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Case Reasoning Visualization ──────────────────────────────────────────────
clinicalVisualizationRouter.post('/case-reasoning', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const {
      complaint = 'unknown',
      symptoms = [],
      differential = [],
      tests = [],
      treatments = [],
      disposition = 'home_care',
      engineTrace,
    } = req.body;

    const result = clinicalDecisionVisualization({
      complaint,
      symptoms,
      differential,
      tests,
      treatments,
      disposition,
      engineTrace,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Engine Dependency Map ─────────────────────────────────────────────────────
clinicalVisualizationRouter.get('/engine-map', requireRole(['admin', 'physician']), (_req, res) => {
  try {
    const content = buildEngineMap();
    res.json({ format: 'mermaid', content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Telepresence Workflow Map ─────────────────────────────────────────────────
clinicalVisualizationRouter.get('/telepresence-workflow', requireRole(['admin', 'physician']), (_req, res) => {
  try {
    const content = buildTelepresenceWorkflow();
    res.json({ format: 'mermaid', content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── All diagram types list ────────────────────────────────────────────────────
clinicalVisualizationRouter.get('/types', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({
    types: [
      { id: 'architecture', label: 'System Architecture', description: '12-layer clinical AI pipeline', endpoint: 'GET /architecture' },
      { id: 'pathway', label: 'Complaint Pathway', description: 'Triage pathway for a specific complaint', endpoint: 'GET /pathway/:complaint' },
      { id: 'case-reasoning', label: 'Case Reasoning', description: 'Visual reasoning graph for one case', endpoint: 'POST /case-reasoning' },
      { id: 'engine-map', label: 'Engine Dependency Map', description: 'How all 71 engines connect', endpoint: 'GET /engine-map' },
      { id: 'telepresence', label: 'Telepresence Workflow', description: 'Device + physician workflow map', endpoint: 'GET /telepresence-workflow' },
    ],
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildComplaintPathway(complaint: string): string {
  const c = complaint.replace(/_/g, ' ');
  return [
    'graph TD',
    `  A([${c}])`,
    `  A --> B{Severity Check}`,
    `  B -->|Mild| C[Symptom Normalization]`,
    `  B -->|Moderate-Severe| D[Safety Guard]`,
    `  D --> E[Red Flag Screen]`,
    `  E -->|Red Flag| F[Emergency Escalation]`,
    `  E -->|Clear| C`,
    `  C --> G[Bayesian Differential]`,
    `  G --> H[Top Differential]`,
    `  H --> I[Test Recommender]`,
    `  I --> J[Treatment Planner]`,
    `  J --> K[Disposition Engine]`,
    `  K --> L[[Physician Review]]`,
    `  L --> M{Approved?}`,
    `  M -->|Yes| N([Patient Discharge])`,
    `  M -->|Needs Changes| G`,
    `  F --> O([ED Transfer])`,
    '',
    `  style A fill:#4f46e5,color:#fff`,
    `  style D fill:#ef4444,color:#fff`,
    `  style F fill:#dc2626,color:#fff`,
    `  style L fill:#7c3aed,color:#fff`,
    `  style N fill:#16a34a,color:#fff`,
  ].join('\n');
}

function buildEngineMap(): string {
  return [
    'graph LR',
    '  subgraph Input',
    '    SI[Symptom Intake]',
    '    SN[Symptom Normalizer]',
    '    CC[Contradiction Check]',
    '  end',
    '  subgraph Reasoning',
    '    SG[Safety Guard]',
    '    CE[Case Similarity]',
    '    BE[Bayesian Engine]',
    '    EA[Evidence Aggregator]',
    '  end',
    '  subgraph Planning',
    '    TR[Test Recommender]',
    '    TX[Treatment Planner]',
    '    DC[Disposition Calibrator]',
    '  end',
    '  subgraph Governance',
    '    PR[Physician Review]',
    '    SA[Safety Auditor]',
    '    OV[Override Engine]',
    '  end',
    '  subgraph Learning',
    '    FL[Feedback Loop]',
    '    ML[Memory Engine]',
    '    CL[Calibration Learning]',
    '  end',
    '  SI --> SN --> CC --> SG',
    '  SG --> CE --> BE --> EA',
    '  EA --> TR --> TX --> DC',
    '  DC --> PR --> SA',
    '  SA -->|override| OV',
    '  PR --> FL --> ML --> CL',
    '  CL -.->|update| BE',
    '',
    '  style SG fill:#ef4444,color:#fff',
    '  style PR fill:#7c3aed,color:#fff',
    '  style CL fill:#0284c7,color:#fff',
  ].join('\n');
}

function buildTelepresenceWorkflow(): string {
  return [
    'graph TD',
    '  A([Patient]) --> B[WhatsApp / Web Chat]',
    '  B --> C[AI Intake Engine]',
    '  C --> D{Triage Level}',
    '  D -->|Low| E[Home Care Protocol]',
    '  D -->|Moderate| F[Telehealth Session]',
    '  D -->|High| G[Urgent Care Referral]',
    '  D -->|Critical| H[ED Transfer + 911]',
    '  F --> I[Physician Dashboard]',
    '  I --> J{Decision}',
    '  J -->|Prescribe| K[e-Prescription]',
    '  J -->|Refer| L[Specialist Referral]',
    '  J -->|Observe| M[Follow-up Scheduled]',
    '  K --> N([Patient Notified])',
    '  L --> N',
    '  M --> N',
    '  G --> O[Care Coordinator]',
    '  O --> N',
    '  H --> P([Emergency Services])',
    '',
    '  style A fill:#4f46e5,color:#fff',
    '  style H fill:#dc2626,color:#fff',
    '  style G fill:#ea580c,color:#fff',
    '  style I fill:#7c3aed,color:#fff',
    '  style P fill:#b91c1c,color:#fff',
  ].join('\n');
}
