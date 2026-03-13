import * as fs from "fs/promises";
import * as path from "path";

const MEMORY_FILE = path.join("data", "case_similarity_memory.ndjson");

export interface CaseMemoryRecord {
  caseId: string;
  complaint: string;
  features: string[];
  disposition: string;
  topDiagnosis: string;
  diagnosisList: string[];
  outcome?: string;
  timestamp: string;
}

export interface SimilarCaseResult {
  caseId: string;
  complaint: string;
  topDiagnosis: string;
  diagnosisList: string[];
  disposition: string;
  similarity: number;
  matchedFeatures: string[];
  timestamp: string;
}

export interface SimilarityReport {
  queryCaseId: string;
  queryComplaint: string;
  queryFeatures: string[];
  totalCasesSearched: number;
  similarCases: SimilarCaseResult[];
  topDiagnosisVotes: Array<{ diagnosis: string; count: number; pct: number }>;
  topDispositionVotes: Array<{ disposition: string; count: number; pct: number }>;
  insight: string;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((x) => x.toLowerCase()));
  const setB = new Set(b.map((x) => x.toLowerCase()));
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function matchedFeatures(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

async function loadMemory(): Promise<CaseMemoryRecord[]> {
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function storeCaseMemory(record: CaseMemoryRecord): Promise<void> {
  try { await fs.mkdir("data", { recursive: true }); } catch {}
  await fs.appendFile(MEMORY_FILE, JSON.stringify(record) + "\n", "utf8");
}

export async function findSimilarCases(
  queryCaseId: string,
  queryComplaint: string,
  queryFeatures: string[],
  topK = 5,
  minSimilarity = 0.1
): Promise<SimilarityReport> {
  const memory = await loadMemory();

  const candidates = memory.filter(
    (m) => m.caseId !== queryCaseId
  );

  const sameComplaint = candidates.filter(
    (m) => m.complaint === queryComplaint
  );
  const pool = sameComplaint.length >= 5 ? sameComplaint : candidates;

  const scored: SimilarCaseResult[] = pool
    .map((m) => {
      const complaintBoost = m.complaint === queryComplaint ? 0.2 : 0;
      const featureSim = jaccardSimilarity(queryFeatures, m.features);
      const similarity = Math.min(1, featureSim + complaintBoost);
      return {
        caseId: m.caseId,
        complaint: m.complaint,
        topDiagnosis: m.topDiagnosis,
        diagnosisList: m.diagnosisList,
        disposition: m.disposition,
        similarity: Math.round(similarity * 100) / 100,
        matchedFeatures: matchedFeatures(queryFeatures, m.features),
        timestamp: m.timestamp,
      };
    })
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const dxVotes: Record<string, number> = {};
  for (const r of scored) {
    dxVotes[r.topDiagnosis] = (dxVotes[r.topDiagnosis] ?? 0) + 1;
  }
  const total = scored.length || 1;
  const topDiagnosisVotes = Object.entries(dxVotes)
    .sort((a, b) => b[1] - a[1])
    .map(([diagnosis, count]) => ({
      diagnosis,
      count,
      pct: Math.round((count / total) * 100),
    }));

  const dispVotes: Record<string, number> = {};
  for (const r of scored) {
    dispVotes[r.disposition] = (dispVotes[r.disposition] ?? 0) + 1;
  }
  const topDispositionVotes = Object.entries(dispVotes)
    .sort((a, b) => b[1] - a[1])
    .map(([disposition, count]) => ({
      disposition,
      count,
      pct: Math.round((count / total) * 100),
    }));

  let insight = "";
  if (scored.length === 0) {
    insight = "No similar cases found in memory yet. This case will be stored for future comparisons.";
  } else {
    const top = topDiagnosisVotes[0];
    const topDisp = topDispositionVotes[0];
    insight = `This patient resembles ${scored.length} previous case${scored.length > 1 ? "s" : ""}. ` +
      `${top ? `${top.pct}% were ${top.diagnosis}.` : ""} ` +
      `${topDisp ? `Most common disposition: ${topDisp.disposition} (${topDisp.pct}%).` : ""}`.trim();
  }

  return {
    queryCaseId,
    queryComplaint,
    queryFeatures,
    totalCasesSearched: pool.length,
    similarCases: scored,
    topDiagnosisVotes,
    topDispositionVotes,
    insight,
  };
}

export async function getMemoryStats(): Promise<{
  totalCases: number;
  byComplaint: Record<string, number>;
  byDisposition: Record<string, number>;
  oldestCase: string;
  newestCase: string;
}> {
  const memory = await loadMemory();
  const byComplaint: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  for (const m of memory) {
    byComplaint[m.complaint] = (byComplaint[m.complaint] ?? 0) + 1;
    byDisposition[m.disposition] = (byDisposition[m.disposition] ?? 0) + 1;
  }
  const timestamps = memory.map((m) => m.timestamp).sort();
  return {
    totalCases: memory.length,
    byComplaint,
    byDisposition,
    oldestCase: timestamps[0] ?? "",
    newestCase: timestamps[timestamps.length - 1] ?? "",
  };
}

export async function seedDemoMemory(): Promise<number> {
  const existing = await loadMemory();
  if (existing.length > 0) return 0;

  const SEED_CASES: CaseMemoryRecord[] = [
    { caseId: "SEED_001", complaint: "sore_throat", features: ["Fever", "No Cough", "Exudate", "Swollen glands"], disposition: "routine", topDiagnosis: "Group A Streptococcal Pharyngitis", diagnosisList: ["Group A Streptococcal Pharyngitis", "Viral Pharyngitis"], timestamp: new Date(Date.now() - 86400000 * 30).toISOString() },
    { caseId: "SEED_002", complaint: "sore_throat", features: ["Fever", "Cough", "Runny nose", "Nasal congestion"], disposition: "home_care", topDiagnosis: "Viral URI", diagnosisList: ["Viral URI", "Allergic Rhinitis"], timestamp: new Date(Date.now() - 86400000 * 28).toISOString() },
    { caseId: "SEED_003", complaint: "cough", features: ["Fever", "Shortness of breath", "Productive cough", "Duration > 7 days"], disposition: "urgent_care", topDiagnosis: "Community-Acquired Pneumonia", diagnosisList: ["Community-Acquired Pneumonia", "Acute Bronchitis"], timestamp: new Date(Date.now() - 86400000 * 25).toISOString() },
    { caseId: "SEED_004", complaint: "cough", features: ["Night symptoms", "Sputum production"], disposition: "home_care", topDiagnosis: "Acute Bronchitis", diagnosisList: ["Acute Bronchitis", "Viral URI"], timestamp: new Date(Date.now() - 86400000 * 22).toISOString() },
    { caseId: "SEED_005", complaint: "chest_pain", features: ["Shortness of breath", "Diaphoresis", "Radiation to arm/jaw"], disposition: "er_now", topDiagnosis: "Acute Coronary Syndrome", diagnosisList: ["Acute Coronary Syndrome", "Aortic Dissection"], timestamp: new Date(Date.now() - 86400000 * 20).toISOString() },
    { caseId: "SEED_006", complaint: "chest_pain", features: ["Pleuritic", "Recent immobility", "Unilateral leg swelling"], disposition: "er_now", topDiagnosis: "Pulmonary Embolism", diagnosisList: ["Pulmonary Embolism", "Pleuritis"], timestamp: new Date(Date.now() - 86400000 * 18).toISOString() },
    { caseId: "SEED_007", complaint: "chest_pain", features: ["Palpitations", "Reproducible on palpation"], disposition: "routine", topDiagnosis: "Musculoskeletal Chest Pain", diagnosisList: ["Musculoskeletal Chest Pain", "GERD"], timestamp: new Date(Date.now() - 86400000 * 15).toISOString() },
    { caseId: "SEED_008", complaint: "uti", features: ["Dysuria", "Frequency", "Urgency", "Hematuria"], disposition: "routine", topDiagnosis: "Uncomplicated UTI", diagnosisList: ["Uncomplicated UTI", "Urethritis"], timestamp: new Date(Date.now() - 86400000 * 14).toISOString() },
    { caseId: "SEED_009", complaint: "uti", features: ["Fever/chills", "Flank pain", "Dysuria"], disposition: "urgent_care", topDiagnosis: "Pyelonephritis", diagnosisList: ["Pyelonephritis", "Uncomplicated UTI"], timestamp: new Date(Date.now() - 86400000 * 12).toISOString() },
    { caseId: "SEED_010", complaint: "fever", features: ["Cough", "Sore throat", "Duration > 5 days", "Myalgia"], disposition: "home_care", topDiagnosis: "Influenza", diagnosisList: ["Influenza", "COVID-19", "Viral URI"], timestamp: new Date(Date.now() - 86400000 * 10).toISOString() },
    { caseId: "SEED_011", complaint: "fever", features: ["Neck stiffness", "Headache", "Photophobia", "Confusion"], disposition: "er_now", topDiagnosis: "Bacterial Meningitis", diagnosisList: ["Bacterial Meningitis", "Viral Meningitis"], timestamp: new Date(Date.now() - 86400000 * 8).toISOString() },
    { caseId: "SEED_012", complaint: "abdominal_pain", features: ["Nausea / vomiting", "RLQ pain", "Fever", "Rebound tenderness"], disposition: "er_now", topDiagnosis: "Appendicitis", diagnosisList: ["Appendicitis", "Ovarian Cyst"], timestamp: new Date(Date.now() - 86400000 * 6).toISOString() },
    { caseId: "SEED_013", complaint: "abdominal_pain", features: ["Diarrhea", "Nausea / vomiting", "No fever"], disposition: "home_care", topDiagnosis: "Viral Gastroenteritis", diagnosisList: ["Viral Gastroenteritis", "Food Poisoning"], timestamp: new Date(Date.now() - 86400000 * 4).toISOString() },
    { caseId: "SEED_014", complaint: "ear_pain", features: ["Fever", "Ear discharge", "Hearing loss", "Recent URI"], disposition: "routine", topDiagnosis: "Acute Otitis Media", diagnosisList: ["Acute Otitis Media", "Otitis Externa"], timestamp: new Date(Date.now() - 86400000 * 3).toISOString() },
    { caseId: "SEED_015", complaint: "sinus_pressure", features: ["Facial pain", "Duration > 10 days", "Purulent nasal discharge", "Fever"], disposition: "routine", topDiagnosis: "Acute Bacterial Sinusitis", diagnosisList: ["Acute Bacterial Sinusitis", "Viral Sinusitis"], timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  ];

  for (const c of SEED_CASES) await storeCaseMemory(c);
  return SEED_CASES.length;
}
