import * as fs from "fs/promises";
import * as path from "path";

export interface RiskFeature {
  name: string;
  weight: number;
  category: "demographic" | "symptom" | "history" | "modifier" | "clinical_score";
  complaint?: string;
}

export interface RiskScore {
  caseId: string;
  complaint: string;
  admissionRisk: number;
  deteriorationRisk: number;
  readmissionRisk30d: number;
  activeFeatures: string[];
  riskLevel: "low" | "moderate" | "high" | "critical";
  recommendation: string;
}

const RISK_PATH = path.join(process.cwd(), "data", "risk_weights.json");

const BASE_FEATURES: RiskFeature[] = [
  { name: "age>65", weight: 0.15, category: "demographic" },
  { name: "age>80", weight: 0.25, category: "demographic" },
  { name: "immunocompromised", weight: 0.20, category: "history" },
  { name: "fever", weight: 0.10, category: "symptom" },
  { name: "shortness of breath", weight: 0.20, category: "symptom" },
  { name: "confusion", weight: 0.25, category: "symptom" },
  { name: "chest pain", weight: 0.20, category: "symptom" },
  { name: "diaphoresis", weight: 0.20, category: "symptom" },
  { name: "anticoagulated", weight: 0.15, category: "modifier" },
  { name: "multiple comorbidities", weight: 0.15, category: "history" },
  { name: "pregnant", weight: 0.10, category: "history" },
  { name: "diabetic", weight: 0.10, category: "history" },
  { name: "renal disease", weight: 0.12, category: "history" },
  { name: "radiation to arm/jaw", weight: 0.25, category: "symptom", complaint: "chest_pain" },
  { name: "flank pain", weight: 0.15, category: "symptom", complaint: "uti" },
  { name: "drooling", weight: 0.20, category: "symptom", complaint: "sore_throat" },
  { name: "muffled voice", weight: 0.20, category: "symptom", complaint: "sore_throat" },
  { name: "rebound tenderness", weight: 0.25, category: "symptom", complaint: "abdominal_pain" },
  { name: "neck stiffness", weight: 0.30, category: "symptom", complaint: "fever" },
  { name: "petechiae", weight: 0.35, category: "symptom", complaint: "rash" },
];

interface WeightStore {
  features: RiskFeature[];
  trainingCount: number;
  lastTrained: string;
}

let weightStore: WeightStore = { features: BASE_FEATURES, trainingCount: 0, lastTrained: "" };
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await fs.readFile(RISK_PATH, "utf8");
    const stored: WeightStore = JSON.parse(raw);
    weightStore = { ...stored, features: stored.features.length > 0 ? stored.features : BASE_FEATURES };
  } catch {}
  loaded = true;
}

async function persist(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(RISK_PATH, JSON.stringify(weightStore, null, 2), "utf8");
}

function extractFeatures(symptoms: string[], patientContext: Record<string, any>, modifiers: Record<string, any>): string[] {
  const combined = [
    ...symptoms.map(s => s.toLowerCase()),
    ...(patientContext.age > 65 ? ["age>65"] : []),
    ...(patientContext.age > 80 ? ["age>80"] : []),
    ...(patientContext.pregnant ? ["pregnant"] : []),
    ...((modifiers.pmh ?? []).map((m: string) => m.toLowerCase())),
    ...((modifiers.medications ?? []).map((m: string) => m.toLowerCase())),
  ];
  return combined;
}

export async function scoreRisk(
  caseId: string,
  complaint: string,
  symptoms: string[],
  patientContext: Record<string, any> = {},
  modifiers: Record<string, any> = {}
): Promise<RiskScore> {
  await load();
  const features = extractFeatures(symptoms, patientContext, modifiers);
  const activeFeatures: string[] = [];
  let rawScore = 0;

  for (const feature of weightStore.features) {
    if (feature.complaint && feature.complaint !== complaint) continue;
    const featureLower = feature.name.toLowerCase();
    const matched = features.some(f => f.includes(featureLower) || featureLower.includes(f.split(" ")[0]));
    if (matched) {
      rawScore += feature.weight;
      activeFeatures.push(feature.name);
    }
  }

  const admissionRisk = Math.min(1, rawScore * 0.8);
  const deteriorationRisk = Math.min(1, rawScore * 0.6 + (features.includes("age>65") ? 0.1 : 0));
  const readmissionRisk30d = Math.min(1, rawScore * 0.4 + (modifiers.pmh?.length > 2 ? 0.15 : 0));

  const maxRisk = Math.max(admissionRisk, deteriorationRisk);
  const riskLevel: RiskScore["riskLevel"] =
    maxRisk > 0.7 ? "critical" : maxRisk > 0.5 ? "high" : maxRisk > 0.3 ? "moderate" : "low";

  const recommendation =
    riskLevel === "critical" ? "Immediate in-person evaluation required." :
    riskLevel === "high" ? "Same-day evaluation strongly recommended." :
    riskLevel === "moderate" ? "Close monitoring. Return precautions provided." :
    "Low risk. Home care with safety netting appropriate.";

  return {
    caseId,
    complaint,
    admissionRisk: Math.round(admissionRisk * 100) / 100,
    deteriorationRisk: Math.round(deteriorationRisk * 100) / 100,
    readmissionRisk30d: Math.round(readmissionRisk30d * 100) / 100,
    activeFeatures,
    riskLevel,
    recommendation,
  };
}

export async function trainModel(
  features: string[],
  outcomeWasAdmitted: boolean,
  learningRate = 0.05
): Promise<void> {
  await load();
  for (const featureName of features) {
    const existing = weightStore.features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
    if (existing) {
      if (outcomeWasAdmitted) {
        existing.weight = Math.min(0.5, existing.weight + learningRate);
      } else {
        existing.weight = Math.max(0.01, existing.weight - learningRate * 0.5);
      }
    }
  }
  weightStore.trainingCount++;
  weightStore.lastTrained = new Date().toISOString();
  await persist();
}

export async function getModelStats(): Promise<{ featureCount: number; trainingCount: number; lastTrained: string; topFeatures: RiskFeature[] }> {
  await load();
  const sorted = [...weightStore.features].sort((a, b) => b.weight - a.weight);
  return {
    featureCount: weightStore.features.length,
    trainingCount: weightStore.trainingCount,
    lastTrained: weightStore.lastTrained,
    topFeatures: sorted.slice(0, 10),
  };
}
