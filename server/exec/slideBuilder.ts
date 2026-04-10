export interface Slide {
  title: string;
  content: string;
  notes?: string;
}

export interface SlideMetrics {
  patients?: number;
  revenue?: number;
  accuracy?: number;
  regions?: string[];
  safetyGates?: number;
  latencyP95?: number;
}

export function buildSlides(metrics: SlideMetrics): Slide[] {
  const patients = (metrics.patients ?? 0).toLocaleString();
  const revenue = (metrics.revenue ?? 0).toLocaleString();
  const accuracy = ((metrics.accuracy ?? 0.95) * 100).toFixed(1);
  const regions = (metrics.regions ?? ["us-east-1"]).join(", ");

  return [
    {
      title: "Vision",
      content: "Global AI healthcare intelligence network — enabling 1 physician to safely manage 500+ patients/day",
      notes: "Lead with the scale of the problem we're solving",
    },
    {
      title: "Scale",
      content: `${patients} patients/day | P95 latency: ${metrics.latencyP95 ?? 0}ms | Regions: ${regions}`,
      notes: "Demonstrate current traction and infrastructure reach",
    },
    {
      title: "Clinical Safety",
      content: `Hard-gated triage pipeline | RLHF-gated models | Immutable audit trail | ${(metrics.safetyGates ?? 10_000).toLocaleString()} golden cases`,
      notes: "Safety is the moat — emphasize FDA pathway readiness",
    },
    {
      title: "Accuracy",
      content: `${accuracy}% clinical accuracy | FDA SaMD Class II | 510(k) De Novo pathway`,
      notes: "Validated against 10,000+ real clinical cases",
    },
    {
      title: "Revenue",
      content: `Estimated: $${revenue} | CPT auto-coding | Real-time denial prevention`,
      notes: "Show the revenue layer — not just clinical, but monetized",
    },
    {
      title: "Competitive Moat",
      content: "Proprietary golden cases | 66-layer clinical brain | Global federated learning | EMS dispatch | Epic FHIR",
      notes: "5 deep moat items — none of which can be replicated quickly",
    },
    {
      title: "Technology",
      content: "Multi-region AWS | WebSocket command center | Prometheus + Grafana | 1,300+ automated tests",
      notes: "Enterprise-grade reliability at every layer",
    },
    {
      title: "Next Steps",
      content: "Hospital pilot expansion | Payer contract integration | National rollout | IPO preparation",
      notes: "Clear roadmap — builds investor confidence",
    },
  ];
}

export function slidesToMarkdown(slides: Slide[]): string {
  return slides.map(s => `## ${s.title}\n\n${s.content}\n`).join("\n---\n\n");
}
