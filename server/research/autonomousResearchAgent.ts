export interface ResearchFinding {
  diagnosis: string;
  complaint: string;
  evidence: string;
  source: string;
  relevanceScore: number;
  dateDiscovered: string;
}

export interface GraphUpdateProposal {
  action: "add_diagnosis" | "add_symptom" | "add_protocol" | "update_weight";
  complaint: string;
  target: string;
  source: string;
  relevanceScore: number;
}

const findingsLog: ResearchFinding[] = [];

export async function scanMedicalResearch(): Promise<ResearchFinding[]> {
  const simulatedFindings: ResearchFinding[] = [
    {
      diagnosis: "myocarditis",
      complaint: "chest_pain",
      evidence: "Recent viral infections increase myocarditis risk — post-COVID myocarditis incidence elevated 3-5x in young adults",
      source: "JAMA Cardiology 2025",
      relevanceScore: 0.85,
      dateDiscovered: new Date().toISOString(),
    },
    {
      diagnosis: "long_covid",
      complaint: "fatigue",
      evidence: "Long COVID symptoms persist >12 weeks in 10-30% of cases, requiring modified triage pathways",
      source: "Lancet 2025",
      relevanceScore: 0.78,
      dateDiscovered: new Date().toISOString(),
    },
    {
      diagnosis: "mpox_pharyngitis",
      complaint: "sore_throat",
      evidence: "Mpox-associated pharyngitis emerging as new differential in endemic areas",
      source: "CDC MMWR 2025",
      relevanceScore: 0.65,
      dateDiscovered: new Date().toISOString(),
    },
    {
      diagnosis: "rsv_bronchiolitis",
      complaint: "cough",
      evidence: "RSV surge patterns shifting — adult RSV bronchiolitis increasing, especially in immunocompromised",
      source: "NEJM 2025",
      relevanceScore: 0.72,
      dateDiscovered: new Date().toISOString(),
    },
    {
      diagnosis: "vestibular_migraine",
      complaint: "dizziness",
      evidence: "Vestibular migraine now recognized as most common cause of episodic vertigo — updated AAN criteria",
      source: "AAN Guidelines 2025",
      relevanceScore: 0.8,
      dateDiscovered: new Date().toISOString(),
    },
  ];

  simulatedFindings.forEach(f => findingsLog.push(f));
  return simulatedFindings;
}

export function proposeGraphUpdates(findings: ResearchFinding[]): GraphUpdateProposal[] {
  return findings
    .filter(f => f.relevanceScore >= 0.6)
    .map(f => ({
      action: "add_diagnosis" as const,
      complaint: f.complaint,
      target: f.diagnosis,
      source: f.evidence,
      relevanceScore: f.relevanceScore,
    }));
}

export function getResearchStats() {
  return {
    totalFindings: findingsLog.length,
    byComplaint: findingsLog.reduce((acc, f) => {
      acc[f.complaint] = (acc[f.complaint] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    recentFindings: findingsLog.slice(-10),
  };
}
