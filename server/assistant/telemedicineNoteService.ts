import { TelemedicineSession } from "./telemedicineSessionService";

export interface ChartNote {
  chiefComplaint: string;
  hpi: string;
  assessment: string;
  plan: string;
  disposition: string;
  safetyNetting: string;
  rawText: string;
}

const PLAN_TEMPLATES: Record<string, Record<string, string>> = {
  sore_throat: {
    Prescription: "1. Amoxicillin 500mg PO TID × 10 days\n2. Ibuprofen 400mg q6h PRN for pain/fever\n3. Warm salt water gargles\n4. Return precautions provided\n5. Return if not improving in 48h or worsening",
    "Home Care": "1. Supportive care — hydration, rest\n2. Ibuprofen 400mg q6h PRN pain/fever\n3. Warm salt water gargles\n4. Throat lozenges PRN\n5. Return if symptoms worsen or fever develops",
  },
  cough: {
    "Home Care": "1. Supportive care — rest, increased fluids, humidifier\n2. Guaifenesin 400mg q4h PRN expectorant\n3. Honey PRN cough suppression\n4. Return if cough > 3 weeks, hemoptysis, or fever > 5 days",
    "Urgent Care": "1. Antibiotics prescribed as indicated\n2. Rest and adequate hydration\n3. Return if worsening SOB or failure to improve in 48h\n4. Repeat CXR in 4–6 weeks recommended",
  },
  uti: {
    Prescription: "1. Nitrofurantoin 100mg ER PO BID × 5 days (with food)\n2. Phenazopyridine 200mg TID × 2 days PRN dysuria\n3. Increase oral fluid intake\n4. Return if fever develops or symptoms not improving in 48h",
  },
  fever: {
    "Home Care": "1. Acetaminophen 650mg q6h PRN temp > 101°F\n2. Ibuprofen 400mg q6h PRN alternating with acetaminophen\n3. Push oral fluids — 2L/day minimum\n4. Monitor temperature q4h\n5. Return if fever > 104°F, rash, stiff neck, or confusion",
  },
  chest_pain: {
    ED: "1. Emergency evaluation required — ER referral\n2. 12-lead ECG stat\n3. Serial troponin\n4. Aspirin 325mg chewed if ACS suspected and no contraindication\n5. Continuous cardiac monitoring",
  },
};

function buildHPI(session: TelemedicineSession): string {
  const complaint = session.complaint?.replace(/_/g, " ") ?? "presenting complaint";
  const symptoms = session.checkedSymptoms.length > 0 ? ` Reports: ${session.checkedSymptoms.join(", ")}.` : "";
  const messages = session.patientMessages.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
  const contextSummary = messages.length > 20 ? ` Patient states: "${messages.slice(0, 200)}${messages.length > 200 ? "…" : ""}".` : "";
  const redFlagNote = session.redFlags.length > 0 ? ` Red flags identified: ${session.redFlags.slice(0, 2).join(", ")}.` : " No red flags triggered.";
  return `Patient presents via telemedicine for ${complaint}.${symptoms}${contextSummary}${redFlagNote}`;
}

function buildAssessment(session: TelemedicineSession): string {
  const complaint = session.complaint?.replace(/_/g, " ") ?? "presenting complaint";
  const diffTop3 = (session.differential ?? []).slice(0, 3).map((d, i) => `${i + 1}. ${d.diagnosis} (${(d.confidence * 100).toFixed(0)}%)`).join(", ");
  const ddxLine = diffTop3 ? `Differential: ${diffTop3}.` : "";
  const safetyLine = session.safetyAlerts.length > 0 ? ` Safety alerts: ${session.safetyAlerts.slice(0, 2).join("; ")}.` : "";
  return `${complaint.charAt(0).toUpperCase() + complaint.slice(1)} — telemedicine evaluation.${ddxLine ? " " + ddxLine : ""}${safetyLine}`;
}

function buildPlan(session: TelemedicineSession): string {
  const template = PLAN_TEMPLATES[session.complaint ?? ""]?.[session.disposition ?? ""] ?? null;
  if (template) return template;
  const meds = session.medicationSuggestions.slice(0, 3);
  const medLine = meds.length > 0 ? meds.map((m, i) => `${i + 1}. ${m}`).join("\n") : "1. Supportive care as indicated";
  return `${medLine}\n${meds.length + 1}. Return precautions provided\n${meds.length + 2}. Follow-up as directed`;
}

export function generateChartNote(session: TelemedicineSession): ChartNote {
  const complaint = session.complaint?.replace(/_/g, " ") ?? "presenting complaint";
  const disposition = session.disposition ?? "pending evaluation";
  const hpi = buildHPI(session);
  const assessment = buildAssessment(session);
  const plan = buildPlan(session);

  const safetyNetting = session.returnPrecautions.slice(0, 4).map(r => `• ${r}`).join("\n") || "• Return if symptoms worsen significantly\n• Seek emergency care for breathing difficulty or chest pain";

  const rawText = [
    `CHIEF COMPLAINT: ${complaint.toUpperCase()}`,
    "",
    `HPI: ${hpi}`,
    "",
    `ASSESSMENT: ${assessment}`,
    "",
    `PLAN:\n${plan}`,
    "",
    `DISPOSITION: ${disposition}`,
    "",
    `SAFETY NETTING:\n${safetyNetting}`,
    "",
    `Visit Type: Telemedicine (synchronous text-based) — patient not physically examined.`,
    `Generated: ${new Date().toLocaleString()}`,
  ].join("\n");

  return { chiefComplaint: complaint, hpi, assessment, plan, disposition, safetyNetting, rawText };
}
