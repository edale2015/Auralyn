export type CrossComplaintRouterInput = {
  complaint: string;
  normalizedSymptoms: string[];
};

export type CrossComplaintRouterOutput = {
  originalComplaint: string;
  routedComplaints: string[];
  reasons: string[];
};

const ROUTES: Array<{
  symptom: string;
  addComplaint: string;
  reason: string;
}> = [
  { symptom: "chest_pain",           addComplaint: "shortness_of_breath", reason: "Chest pain often overlaps cardiopulmonary workup" },
  { symptom: "shortness_of_breath",  addComplaint: "chest_pain",          reason: "Dyspnea may reflect cardiopulmonary chest-pain equivalent" },
  { symptom: "vomiting",             addComplaint: "abdominal_pain",       reason: "Vomiting often requires abdominal pathway consideration" },
  { symptom: "dysuria",              addComplaint: "abdominal_pain",       reason: "Urinary symptoms can reflect abdominal/pelvic pathology" },
  { symptom: "headache",             addComplaint: "neurologic",           reason: "Headache may require neurologic pathway" },
  { symptom: "syncope",              addComplaint: "chest_pain",           reason: "Syncope may require cardiac pathway evaluation" },
  { symptom: "weakness",             addComplaint: "neurologic",           reason: "Weakness may require neurologic pathway" },
  { symptom: "flank_pain",           addComplaint: "dysuria",              reason: "Flank pain may overlap urinary/kidney pathway" },
  { symptom: "neck_stiffness",       addComplaint: "headache",             reason: "Neck stiffness with any complaint warrants meningitis consideration" },
  { symptom: "fever",                addComplaint: "cough",                reason: "Fever may indicate respiratory source" },
];

export function crossComplaintRouterEngine(
  input: CrossComplaintRouterInput
): CrossComplaintRouterOutput {
  const routed = new Set<string>([input.complaint]);
  const reasons: string[] = [];

  for (const rule of ROUTES) {
    if (
      input.normalizedSymptoms.includes(rule.symptom) &&
      rule.addComplaint !== input.complaint &&
      !routed.has(rule.addComplaint)
    ) {
      routed.add(rule.addComplaint);
      reasons.push(rule.reason);
    }
  }

  return {
    originalComplaint: input.complaint,
    routedComplaints: Array.from(routed),
    reasons,
  };
}
