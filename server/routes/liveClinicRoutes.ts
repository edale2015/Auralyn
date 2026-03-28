import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { tenantManager } from "../core/tenantManager";
import { buildClaim, ClaimData } from "../billing/claimBuilder";
import { submitClaim, getSubmittedClaims } from "../billing/submitClaim";
import { mapToBilling } from "../billing/codingEngine";

const router = Router();

// ─── In-memory stores (scoped per clinic) ──────────────────────────────────
interface Patient {
  id: string;
  clinicId: string;
  name: string;
  age: number;
  dob?: string;
  createdAt: string;
}

interface Encounter {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  complaint: string;
  symptoms: string;
  status: "ACTIVE" | "COMPLETED" | "BILLED";
  result?: EncounterResult;
  claim?: ClaimData;
  claimRef?: string;
  startedAt: string;
  completedAt?: string;
}

interface EncounterResult {
  diagnosis: string;
  disposition: string;
  confidence: number;
  icd10: string;
  cptCode: string;
  cptDescription: string;
  safetyLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  visitType: string;
}

const patients: Record<string, Patient> = {};
const encounters: Record<string, Encounter> = {};

// ─── Clinical AI engine (deterministic demo) ───────────────────────────────
const CLINICAL_RULES: Array<{
  keywords: string[];
  diagnosis: string;
  disposition: string;
  visitType: string;
  safetyLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
}> = [
  {
    keywords: ["chest", "pain", "pressure", "heart", "cardiac", "acs", "mi"],
    diagnosis: "Chest Pain — Possible ACS",
    disposition: "ER",
    visitType: "emergency",
    safetyLevel: "HIGH",
    reasoning: "Chest pain pattern requiring emergency evaluation and ECG/troponin workup.",
  },
  {
    keywords: ["throat", "sore", "pharyngitis", "strep", "tonsil"],
    diagnosis: "Pharyngitis",
    disposition: "home",
    visitType: "telemed",
    safetyLevel: "LOW",
    reasoning: "Sore throat presentation consistent with viral/bacterial pharyngitis.",
  },
  {
    keywords: ["ear", "earache", "otitis", "hearing", "otalgia"],
    diagnosis: "Otitis Media",
    disposition: "home",
    visitType: "routine",
    safetyLevel: "LOW",
    reasoning: "Ear pain pattern consistent with acute otitis media.",
  },
  {
    keywords: ["headache", "migraine", "head", "cephalgia"],
    diagnosis: "Migraine",
    disposition: "home",
    visitType: "routine",
    safetyLevel: "MEDIUM",
    reasoning: "Headache presentation consistent with migraine pattern.",
  },
  {
    keywords: ["breath", "breathing", "shortness", "dyspnea", "asthma", "copd"],
    diagnosis: "Dyspnea — Possible Pulmonary",
    disposition: "ER",
    visitType: "emergency",
    safetyLevel: "HIGH",
    reasoning: "Respiratory distress requiring urgent evaluation.",
  },
  {
    keywords: ["fever", "flu", "influenza", "ache", "chills"],
    diagnosis: "Influenza-Like Illness",
    disposition: "home",
    visitType: "telemed",
    safetyLevel: "LOW",
    reasoning: "Flu syndrome presentation — supportive care appropriate.",
  },
  {
    keywords: ["uti", "urinary", "burning", "frequency", "bladder"],
    diagnosis: "Urinary Tract Infection",
    disposition: "home",
    visitType: "routine",
    safetyLevel: "LOW",
    reasoning: "Classic UTI presentation — antibiotic therapy appropriate.",
  },
  {
    keywords: ["rash", "skin", "allergic", "hives", "urticaria", "itch"],
    diagnosis: "Allergic Reaction",
    disposition: "home",
    visitType: "routine",
    safetyLevel: "MEDIUM",
    reasoning: "Allergic presentation without anaphylaxis indicators.",
  },
  {
    keywords: ["nausea", "vomit", "stomach", "abdominal", "abdomen", "gastro"],
    diagnosis: "Gastroenteritis",
    disposition: "home",
    visitType: "routine",
    safetyLevel: "LOW",
    reasoning: "GI complaint pattern consistent with viral gastroenteritis.",
  },
  {
    keywords: ["stroke", "facial", "droop", "slur", "weakness", "vision"],
    diagnosis: "Stroke — FAST Protocol",
    disposition: "ER",
    visitType: "emergency",
    safetyLevel: "HIGH",
    reasoning: "Stroke symptoms — immediate emergency evaluation required.",
  },
  {
    keywords: ["sinusitis", "sinus", "congestion", "nasal", "stuffy"],
    diagnosis: "Sinusitis",
    disposition: "home",
    visitType: "telemed",
    safetyLevel: "LOW",
    reasoning: "Sinus congestion pattern consistent with acute sinusitis.",
  },
  {
    keywords: ["anxiety", "panic", "stress", "depression", "mental"],
    diagnosis: "Anxiety / Panic Disorder",
    disposition: "home",
    visitType: "complex",
    safetyLevel: "MEDIUM",
    reasoning: "Mental health presentation requiring comprehensive evaluation.",
  },
];

function runClinicalAI(complaint: string, symptoms: string): EncounterResult {
  const input = `${complaint} ${symptoms}`.toLowerCase();
  for (const rule of CLINICAL_RULES) {
    if (rule.keywords.some((kw) => input.includes(kw))) {
      const billing = mapToBilling(rule.diagnosis, rule.visitType);
      return {
        diagnosis: rule.diagnosis,
        disposition: rule.disposition,
        confidence: 0.78 + Math.random() * 0.18,
        icd10: billing.icd10,
        cptCode: billing.cpt.code,
        cptDescription: billing.cpt.description,
        safetyLevel: rule.safetyLevel,
        reasoning: rule.reasoning,
        visitType: rule.visitType,
      };
    }
  }
  const billing = mapToBilling("Abdominal Pain", "routine");
  return {
    diagnosis: "Undifferentiated Complaint",
    disposition: "home",
    confidence: 0.55,
    icd10: billing.icd10,
    cptCode: billing.cpt.code,
    cptDescription: billing.cpt.description,
    safetyLevel: "LOW",
    reasoning: "Insufficient data for specific diagnosis — general evaluation recommended.",
    visitType: "routine",
  };
}

// ─── GET /api/live-clinic/tenants ───────────────────────────────────────────
router.get("/tenants", (_req: Request, res: Response) => {
  res.json({ ok: true, tenants: tenantManager.getAll() });
});

// ─── POST /api/live-clinic/tenant ───────────────────────────────────────────
router.post("/tenant", (req: Request, res: Response) => {
  const { name, email, plan } = req.body;
  if (!name || !email) return res.status(400).json({ error: "name and email required" });
  const tenant = tenantManager.create(name, email, plan || "basic");
  res.json({ ok: true, tenant });
});

// ─── POST /api/live-clinic/patient ──────────────────────────────────────────
router.post("/patient", (req: Request, res: Response) => {
  const { clinicId, name, age } = req.body;
  if (!clinicId || !name || age === undefined) {
    return res.status(400).json({ error: "clinicId, name, age required" });
  }
  const tenant = tenantManager.get(clinicId);
  if (!tenant) return res.status(404).json({ error: "Clinic not found" });

  const patient: Patient = {
    id: `PAT-${uuidv4().split("-")[0].toUpperCase()}`,
    clinicId,
    name,
    age: Number(age),
    createdAt: new Date().toISOString(),
  };
  patients[patient.id] = patient;
  res.json({ ok: true, patient });
});

// ─── POST /api/live-clinic/encounter/start ──────────────────────────────────
router.post("/encounter/start", (req: Request, res: Response) => {
  const { clinicId, patientId, patientName, complaint, symptoms } = req.body;
  if (!clinicId || !complaint) {
    return res.status(400).json({ error: "clinicId and complaint required" });
  }
  const enc: Encounter = {
    id: `ENC-${uuidv4().split("-")[0].toUpperCase()}`,
    clinicId,
    patientId: patientId || `PAT-WALK-${Date.now()}`,
    patientName: patientName || "Walk-in Patient",
    complaint,
    symptoms: symptoms || "",
    status: "ACTIVE",
    startedAt: new Date().toISOString(),
  };
  encounters[enc.id] = enc;
  tenantManager.incrementCases(clinicId);
  res.json({ ok: true, encounter: enc });
});

// ─── POST /api/live-clinic/encounter/run ────────────────────────────────────
router.post("/encounter/run", async (req: Request, res: Response) => {
  const { encounterId } = req.body;
  if (!encounterId) return res.status(400).json({ error: "encounterId required" });

  const enc = encounters[encounterId];
  if (!enc) return res.status(404).json({ error: "Encounter not found" });

  const result = runClinicalAI(enc.complaint, enc.symptoms);
  enc.result = result;
  enc.status = "COMPLETED";
  enc.completedAt = new Date().toISOString();

  res.json({ ok: true, encounter: enc, result });
});

// ─── POST /api/live-clinic/billing/generate ─────────────────────────────────
router.post("/billing/generate", (req: Request, res: Response) => {
  const { encounterId } = req.body;
  if (!encounterId) return res.status(400).json({ error: "encounterId required" });

  const enc = encounters[encounterId];
  if (!enc) return res.status(404).json({ error: "Encounter not found" });
  if (!enc.result) return res.status(400).json({ error: "Encounter has not been run yet" });

  const claim = buildClaim(
    { diagnosis: enc.result.diagnosis, triage: enc.result.visitType },
    { id: enc.patientId, provider: `Clinic: ${enc.clinicId}` }
  );
  enc.claim = claim;
  res.json({ ok: true, claim });
});

// ─── POST /api/live-clinic/billing/submit ────────────────────────────────────
router.post("/billing/submit", async (req: Request, res: Response) => {
  const { encounterId } = req.body;
  if (!encounterId) return res.status(400).json({ error: "encounterId required" });

  const enc = encounters[encounterId];
  if (!enc) return res.status(404).json({ error: "Encounter not found" });
  if (!enc.claim) return res.status(400).json({ error: "Generate claim first" });

  const submission = await submitClaim(enc.claim);
  enc.status = "BILLED";
  enc.claimRef = submission.clearinghouseRef;

  res.json({ ok: true, submission, encounter: enc });
});

// ─── GET /api/live-clinic/encounters ────────────────────────────────────────
router.get("/encounters", (req: Request, res: Response) => {
  const clinicId = req.query.clinicId as string | undefined;
  const list = Object.values(encounters)
    .filter((e) => !clinicId || e.clinicId === clinicId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 50);
  res.json({ ok: true, encounters: list });
});

// ─── GET /api/live-clinic/dashboard/:clinicId ────────────────────────────────
router.get("/dashboard/:clinicId", (req: Request, res: Response) => {
  const { clinicId } = req.params;
  const tenant = tenantManager.get(clinicId);
  if (!tenant) return res.status(404).json({ error: "Clinic not found" });

  const clinicEncs = Object.values(encounters).filter((e) => e.clinicId === clinicId);
  const active = clinicEncs.filter((e) => e.status === "ACTIVE").length;
  const completed = clinicEncs.filter((e) => e.status === "COMPLETED").length;
  const billed = clinicEncs.filter((e) => e.status === "BILLED").length;

  const erCount = clinicEncs.filter((e) => e.result?.disposition === "ER").length;
  const highSafety = clinicEncs.filter((e) => e.result?.safetyLevel === "HIGH").length;

  const billedEncs = clinicEncs.filter((e) => e.claim);
  const avgCpt = billedEncs.length
    ? billedEncs.reduce((_acc, e) => {
        const cptNum = parseInt(e.claim?.procedure || "99213");
        return cptNum;
      }, 0)
    : 0;

  res.json({
    ok: true,
    tenant,
    stats: {
      totalEncounters: clinicEncs.length,
      active,
      completed,
      billed,
      erReferrals: erCount,
      highSafetyFlags: highSafety,
      casesRemaining: tenant.maxCases - tenant.casesUsed,
    },
  });
});

// ─── GET /api/live-clinic/claims ────────────────────────────────────────────
router.get("/claims", (_req: Request, res: Response) => {
  res.json({ ok: true, claims: getSubmittedClaims(50) });
});

export default router;
