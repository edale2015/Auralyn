import { runClinicalWorkflow } from "../workflows/clinicalWorkflowEngine";

export interface TrialPatient {
  patientId: string;
  complaint:  string;
  vitals:     Record<string, number>;
  symptoms:   Record<string, boolean>;
}

export interface TrialCaseResult {
  patient:    TrialPatient;
  outcome:    string | undefined;
  diagnosis:  string | undefined;
  confidence: number | undefined;
  riskLevel:  string | undefined;
}

export interface TrialSummary {
  total:          number;
  edRate:         number;
  avgConfidence:  number;
  edCount:        number;
  homeCount:      number;
  byComplaint:    Record<string, { count: number; edRate: number; avgConf: number }>;
  results:        TrialCaseResult[];
}

const MAX_N = 500;

class TrialSimulator {
  generatePatient(i: number): TrialPatient {
    const complaint = i % 3 === 0 ? "fever"
                    : i % 3 === 1 ? "cough"
                    : "chest pain";

    return {
      patientId: `trial-${i}`,
      complaint,
      vitals: {
        tempF:      97 + Math.random() * 7,
        hr:         60 + Math.random() * 80,
        spo2:       88 + Math.random() * 12,
        rr:         12 + Math.random() * 22,
        systolicBP: 80 + Math.random() * 60,
      },
      symptoms: {
        sob:        Math.random() > 0.7,
        chestPain:  complaint === "chest pain" ? Math.random() > 0.3 : Math.random() > 0.9,
        confusion:  Math.random() > 0.85,
        chills:     Math.random() > 0.6,
      },
    };
  }

  async runTrial(n = 100): Promise<TrialSummary> {
    const safeN   = Math.min(n, MAX_N);
    const results: TrialCaseResult[] = [];

    for (let i = 0; i < safeN; i++) {
      const patient = this.generatePatient(i);
      const result  = await runClinicalWorkflow(patient);

      results.push({
        patient,
        outcome:    result.disposition,
        diagnosis:  result.diagnosis,
        confidence: result.confidence,
        riskLevel:  result.riskLevel,
      });
    }

    return this.analyze(results);
  }

  analyze(results: TrialCaseResult[]): TrialSummary {
    const total = results.length;
    if (total === 0) {
      return { total: 0, edRate: 0, avgConfidence: 0, edCount: 0, homeCount: 0, byComplaint: {}, results: [] };
    }

    const edCount   = results.filter((r) => r.outcome === "ED now").length;
    const homeCount = results.filter((r) => r.outcome !== "ED now").length;
    const edRate    = edCount / total;
    const avgConfidence = results.reduce((s, r) => s + (r.confidence ?? 0), 0) / total;

    const byComplaint: Record<string, { count: number; edRate: number; avgConf: number }> = {};
    for (const r of results) {
      const c = r.patient.complaint;
      if (!byComplaint[c]) byComplaint[c] = { count: 0, edRate: 0, avgConf: 0 };
      const group = byComplaint[c];
      group.count++;
      if (r.outcome === "ED now") group.edRate++;
      group.avgConf += r.confidence ?? 0;
    }
    for (const c of Object.keys(byComplaint)) {
      byComplaint[c].edRate    = byComplaint[c].edRate    / byComplaint[c].count;
      byComplaint[c].avgConf   = byComplaint[c].avgConf   / byComplaint[c].count;
    }

    return { total, edRate, avgConfidence, edCount, homeCount, byComplaint, results };
  }
}

export const trialSimulator = new TrialSimulator();
