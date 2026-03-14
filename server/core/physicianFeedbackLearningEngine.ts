import fs from "fs";
import path from "path";

export type PhysicianFeedbackEntry = {
  timestamp: string;
  caseId: string;
  complaint: string;
  modelTopDiagnosis?: string;
  modelDisposition?: string;
  physicianDiagnosis?: string;
  physicianDisposition?: string;
  agreeDiagnosis: boolean;
  agreeDisposition: boolean;
  notes?: string;
  tags?: string[];
};

export type FeedbackStats = {
  totalCases: number;
  diagnosisAgreementRate: number;
  dispositionAgreementRate: number;
  byComplaint: Record<string, {
    total: number;
    diagnosisAgreementRate: number;
    dispositionAgreementRate: number;
  }>;
  recentDisagreements: Array<{
    caseId: string;
    complaint: string;
    modelDx?: string;
    physicianDx?: string;
    modelDisp?: string;
    physicianDisp?: string;
    notes?: string;
  }>;
};

const DATA_DIR     = path.resolve(process.cwd(), "server/data");
const FEEDBACK_FILE = path.join(DATA_DIR, "physician_feedback.ndjson");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function appendPhysicianFeedback(entry: PhysicianFeedbackEntry): void {
  ensureDir();
  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + "\n", "utf8");
}

export function readPhysicianFeedback(): PhysicianFeedbackEntry[] {
  ensureDir();
  if (!fs.existsSync(FEEDBACK_FILE)) return [];
  const raw = fs.readFileSync(FEEDBACK_FILE, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      try { return JSON.parse(line) as PhysicianFeedbackEntry; }
      catch { return null; }
    })
    .filter(Boolean) as PhysicianFeedbackEntry[];
}

export function physicianFeedbackLearningEngine(): FeedbackStats {
  const rows      = readPhysicianFeedback();
  const totalCases = rows.length;

  if (totalCases === 0) {
    return {
      totalCases: 0,
      diagnosisAgreementRate: 0,
      dispositionAgreementRate: 0,
      byComplaint: {},
      recentDisagreements: [],
    };
  }

  const dxAgree   = rows.filter((r) => r.agreeDiagnosis).length;
  const dispAgree = rows.filter((r) => r.agreeDisposition).length;

  const byComplaint: FeedbackStats["byComplaint"] = {};

  for (const row of rows) {
    if (!byComplaint[row.complaint]) {
      byComplaint[row.complaint] = { total: 0, diagnosisAgreementRate: 0, dispositionAgreementRate: 0 };
    }
    byComplaint[row.complaint].total += 1;
  }

  for (const complaint of Object.keys(byComplaint)) {
    const subset         = rows.filter((r) => r.complaint === complaint);
    const subsetDxAgree  = subset.filter((r) => r.agreeDiagnosis).length;
    const subsetDispAgree = subset.filter((r) => r.agreeDisposition).length;
    byComplaint[complaint].diagnosisAgreementRate   = Number((subsetDxAgree  / subset.length).toFixed(3));
    byComplaint[complaint].dispositionAgreementRate = Number((subsetDispAgree / subset.length).toFixed(3));
  }

  // Surface the 10 most recent disagreements for dashboard visibility
  const recentDisagreements = rows
    .filter((r) => !r.agreeDiagnosis || !r.agreeDisposition)
    .slice(-10)
    .reverse()
    .map((r) => ({
      caseId:          r.caseId,
      complaint:       r.complaint,
      modelDx:         r.modelTopDiagnosis,
      physicianDx:     r.physicianDiagnosis,
      modelDisp:       r.modelDisposition,
      physicianDisp:   r.physicianDisposition,
      notes:           r.notes,
    }));

  return {
    totalCases,
    diagnosisAgreementRate:   Number((dxAgree   / totalCases).toFixed(3)),
    dispositionAgreementRate: Number((dispAgree / totalCases).toFixed(3)),
    byComplaint,
    recentDisagreements,
  };
}
