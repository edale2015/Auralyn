import { logMetric } from "../monitoring/metrics";

export interface PopulationCase {
  caseId:    string;
  zip:       string;
  complaint: string;
  diagnosis: string;
  severity:  "low" | "medium" | "high" | "critical";
  ageGroup:  "pediatric" | "adult" | "senior";
  payer:     string;
  loggedAt:  string;
}

export interface OutbreakAlert {
  alertId:    string;
  zip:        string;
  complaint:  string;
  count:      number;
  threshold:  number;
  detectedAt: string;
  severity:   "watch" | "warning" | "alert";
}

const cases: PopulationCase[] = [];
const outbreaks: OutbreakAlert[] = [];
const OUTBREAK_THRESHOLD = 5;

const NYC_ZIPS = ["10001","10002","10003","10031","10032","10033","10034","10040","10027","10029","10035","10036","10037","10038","10039"];
const COMPLAINTS = ["sore throat","ear pain","fever and body aches","cough","sinus pressure and headache","fever with loss of smell","chest pain","severe sudden headache","shortness of breath","skin rash"];
const DIAGNOSES  = ["Viral URI","Strep Pharyngitis","Acute Otitis Media","Influenza A","Sinusitis","COVID-19","Pneumonia","Anxiety","Otitis Externa"];
const PAYERS     = ["bcbs-ny","aetna","cigna","unitedhealth","medicaid","medicare","humana","unknown"];
const AGE_GROUPS: PopulationCase["ageGroup"][] = ["pediatric","adult","adult","adult","senior"];
const SEVERITIES: PopulationCase["severity"][] = ["low","low","medium","medium","medium","high","critical"];

export function logPopulationCase(c: Partial<PopulationCase> & { caseId: string }): void {
  const entry: PopulationCase = {
    caseId:    c.caseId,
    zip:       c.zip       ?? NYC_ZIPS[Math.floor(Math.random() * NYC_ZIPS.length)],
    complaint: c.complaint ?? COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)],
    diagnosis: c.diagnosis ?? DIAGNOSES[Math.floor(Math.random() * DIAGNOSES.length)],
    severity:  c.severity  ?? SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)],
    ageGroup:  c.ageGroup  ?? AGE_GROUPS[Math.floor(Math.random() * AGE_GROUPS.length)],
    payer:     c.payer     ?? PAYERS[Math.floor(Math.random() * PAYERS.length)],
    loggedAt:  new Date().toISOString(),
  };
  cases.unshift(entry);
  if (cases.length > 2000) cases.pop();

  checkForOutbreak(entry);
  logMetric("population.case_logged", 1, "throughput", { zip: entry.zip, diagnosis: entry.diagnosis });
}

function checkForOutbreak(newCase: PopulationCase): void {
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const cutoff   = Date.now() - windowMs;
  const recent   = cases.filter(c =>
    c.zip === newCase.zip &&
    c.complaint === newCase.complaint &&
    new Date(c.loggedAt).getTime() > cutoff
  );

  if (recent.length >= OUTBREAK_THRESHOLD) {
    const existingAlert = outbreaks.find(o =>
      o.zip === newCase.zip && o.complaint === newCase.complaint
    );
    const severity: OutbreakAlert["severity"] = recent.length >= 15 ? "alert" : recent.length >= 8 ? "warning" : "watch";

    if (existingAlert) {
      existingAlert.count      = recent.length;
      existingAlert.severity   = severity;
      existingAlert.detectedAt = new Date().toISOString();
    } else {
      outbreaks.unshift({
        alertId:    `OB-${Date.now()}`,
        zip:        newCase.zip,
        complaint:  newCase.complaint,
        count:      recent.length,
        threshold:  OUTBREAK_THRESHOLD,
        detectedAt: new Date().toISOString(),
        severity,
      });
      if (outbreaks.length > 20) outbreaks.pop();
      console.log(`[PopulationHealth] 🚨 Outbreak detected in ZIP ${newCase.zip}: ${newCase.complaint} (${recent.length} cases)`);
    }
  }
}

export function getZipHeatmap(): Record<string, number> {
  return cases.reduce((acc, c) => {
    acc[c.zip] = (acc[c.zip] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function getComplaintHeatmap(): Record<string, number> {
  return cases.reduce((acc, c) => {
    acc[c.complaint] = (acc[c.complaint] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function getDiagnosisHeatmap(): Record<string, number> {
  return cases.reduce((acc, c) => {
    acc[c.diagnosis] = (acc[c.diagnosis] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function getOutbreakAlerts(): OutbreakAlert[] {
  return [...outbreaks];
}

export function getCohortStats() {
  const total = cases.length;
  const byAge  = cases.reduce((acc, c) => { acc[c.ageGroup] = (acc[c.ageGroup] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const bySeverity = cases.reduce((acc, c) => { acc[c.severity] = (acc[c.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const byPayer    = cases.reduce((acc, c) => { acc[c.payer] = (acc[c.payer] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const topZips    = Object.entries(getZipHeatmap()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topComplaints = Object.entries(getComplaintHeatmap()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { total, byAge, bySeverity, byPayer, topZips, topComplaints, activeOutbreaks: outbreaks.length };
}

export function getRecentCases(limit = 50): PopulationCase[] {
  return cases.slice(0, limit);
}

// Seed with realistic NYC data
(function seed() {
  const count = 80;
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 7);
    const c: Partial<PopulationCase> & { caseId: string } = {
      caseId:    `seed-${i}`,
      zip:       NYC_ZIPS[Math.floor(Math.random() * NYC_ZIPS.length)],
      complaint: COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)],
      diagnosis: DIAGNOSES[Math.floor(Math.random() * DIAGNOSES.length)],
      severity:  SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)],
      ageGroup:  AGE_GROUPS[Math.floor(Math.random() * AGE_GROUPS.length)],
      payer:     PAYERS[Math.floor(Math.random() * PAYERS.length)],
    };
    logPopulationCase(c);
  }
})();
