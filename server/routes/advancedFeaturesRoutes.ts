/**
 * Advanced Features Routes  —  /api/advanced/*
 *
 * Exposes the 8 Depth & Maturity Layer modules:
 *   1. SMART on FHIR Full Launch Flow
 *   2. Epic Sandbox Adapter
 *   3. Real eRx Connector
 *   4. HCC Coding Engine
 *   5. Payer-Specific Rules
 *   6. Bayesian Differential Engine
 *   7. Cryptographic Audit Log
 *   8. Model Freeze + Version Lock
 *   9. Validation Study Pipeline (smoke run)
 */

import { Router, Request, Response } from "express";

import { buildAuthUrl, isSmartLaunchConfigured }               from "../ehr/fhir/smartLaunch";
import { isEpicAdapterConfigured, getCapabilityStatement }     from "../ehr/fhir/epicAdapter";
import { sendRealERx, getErxProvider }                         from "../medications/erxReal";
import { detectHCC, computeRafScore }                          from "../billing/hccEngine";
import { payerSpecificAdjustments, listSupportedPayers }       from "../billing/payerRules";
import { topDifferentials }                                    from "../clinical/bayesianEngine";
import { logSecureEvent, verifyChain, getSecureAuditRecords, getSecureAuditStats } from "../ops/secureAudit";
import { freezeModel, unfreezeModel, getStatus as getFreezeStatus, canLearn } from "../release/modelFreeze";
import { runSmokeStudy }                                       from "../fda/studyPipeline";
import { topDifferentials as bayesDiff }                       from "../clinical/bayesianEngine";
import { logEvent }                                            from "../ops/auditEvents";

const router = Router();

// ── 1. SMART on FHIR Launch Flow ─────────────────────────────────────────────

router.get("/smart/status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    configured: isSmartLaunchConfigured(),
    requiredEnvVars: ["FHIR_BASE_URL", "FHIR_CLIENT_ID", "FHIR_REDIRECT_URI"],
    optionalEnvVars: ["FHIR_SCOPE"],
    flows: ["authorization_code (App Launch)", "client_credentials (M2M)"],
    message: isSmartLaunchConfigured()
      ? "SMART on FHIR launch flow is fully configured"
      : "Set FHIR_CLIENT_ID + FHIR_REDIRECT_URI to enable EHR launch",
  });
});

router.post("/smart/build-auth-url", (req: Request, res: Response) => {
  const { iss, launch, state, additionalScope } = req.body;
  if (!iss) return res.status(400).json({ error: "iss (FHIR base URL) is required" });
  const url = buildAuthUrl({ iss, launch, state, additionalScope });
  return res.json({ ok: true, authUrl: url });
});

// ── 2. Epic Sandbox Adapter ───────────────────────────────────────────────────

router.get("/epic/status", async (_req: Request, res: Response) => {
  const configured = isEpicAdapterConfigured();
  if (!configured) {
    return res.json({ ok: true, configured: false, message: "Set FHIR_BASE_URL to enable Epic Sandbox adapter" });
  }
  try {
    const capability = await getCapabilityStatement();
    return res.json({ ok: true, configured: true, fhirVersion: capability?.fhirVersion, name: capability?.name });
  } catch (err) {
    return res.json({ ok: true, configured: true, message: "FHIR configured but capability check failed (sandbox may need auth)" });
  }
});

// ── 3. Real eRx Connector ─────────────────────────────────────────────────────

router.get("/erx/status", (_req: Request, res: Response) => {
  res.json({
    ok:       true,
    provider: getErxProvider(),
    providers: ["stub", "surescripts", "ncpdp_script"],
    configVar: "ERX_PROVIDER",
    message:  `Active provider: ${getErxProvider()}`,
  });
});

router.post("/erx/send-real", async (req: Request, res: Response) => {
  const { patientId, prescriberId, prescriberNpi, drug, dose, quantity, refills, pharmacyNcpdp } = req.body;
  if (!drug || !pharmacyNcpdp || !prescriberNpi) {
    return res.status(400).json({ error: "drug, pharmacyNcpdp, prescriberNpi required" });
  }
  try {
    const result = await sendRealERx({
      patientId:     patientId     ?? "unknown",
      prescriberId:  prescriberId  ?? "provider-1",
      prescriberNpi: prescriberNpi,
      drug, dose: dose ?? "as directed",
      quantity: Number(quantity) || 30,
      refills:  Number(refills)  || 0,
      pharmacyNcpdp,
    });
    logEvent({ type: "ERX_REAL_SENT", actor: prescriberNpi, severity: "info", payload: result as any });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "eRx failed" });
  }
});

// ── 4. HCC Coding Engine ──────────────────────────────────────────────────────

router.post("/hcc/detect", (req: Request, res: Response) => {
  const { diagnoses = [] } = req.body;
  if (!Array.isArray(diagnoses)) return res.status(400).json({ error: "diagnoses must be an array of ICD-10 strings" });
  const result = computeRafScore(diagnoses);
  return res.json({ ok: true, ...result });
});

router.get("/hcc/demo", (_req: Request, res: Response) => {
  const result = computeRafScore(["E11.9", "I50", "J44", "E78.5"]);
  return res.json({ ok: true, demo: true, diagnoses: ["E11.9 (Diabetes)", "I50 (CHF)", "J44 (COPD)", "E78.5 (Morbid Obesity)"], ...result });
});

// ── 5. Payer-Specific Rules ───────────────────────────────────────────────────

router.get("/payer/list", (_req: Request, res: Response) => {
  res.json({ ok: true, payers: listSupportedPayers() });
});

router.post("/payer/adjust", (req: Request, res: Response) => {
  const { claim, payer } = req.body;
  if (!claim || !payer) return res.status(400).json({ error: "claim and payer are required" });
  const result = payerSpecificAdjustments(claim, payer);
  return res.json({ ok: true, payer, ...result });
});

// ── 6. Bayesian Differential Engine ──────────────────────────────────────────

router.post("/differential/run", (req: Request, res: Response) => {
  const { symptoms = [], topN = 5, minPosterior = 0.03 } = req.body;
  if (!Array.isArray(symptoms)) return res.status(400).json({ error: "symptoms must be an array of strings" });
  const differentials = topDifferentials(symptoms, Number(topN), Number(minPosterior));
  return res.json({ ok: true, inputSymptoms: symptoms, count: differentials.length, differentials });
});

router.get("/differential/demo", (_req: Request, res: Response) => {
  const symptoms = ["sore throat", "fever", "tonsillar exudate", "lymphadenopathy"];
  const differentials = topDifferentials(symptoms, 5, 0.02);
  return res.json({ ok: true, demo: true, symptoms, differentials });
});

// ── 7. Cryptographic Audit Log ────────────────────────────────────────────────

router.get("/secure-audit/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getSecureAuditStats() });
});

router.get("/secure-audit/records", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const records = getSecureAuditRecords(limit);
  res.json({ ok: true, count: records.length, records });
});

router.get("/secure-audit/verify", (_req: Request, res: Response) => {
  const result = verifyChain();
  res.json({ ok: true, ...result });
});

router.post("/secure-audit/log", (req: Request, res: Response) => {
  const { type = "GENERIC", actor, clinicId, entityId, payload } = req.body;
  logSecureEvent({ type, actor, clinicId, entityId, payload });
  const stats = getSecureAuditStats();
  return res.json({ ok: true, message: "Secure event logged", ...stats });
});

// ── 8. Model Freeze + Version Lock ───────────────────────────────────────────

router.get("/model-freeze/status", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getFreezeStatus(), canLearn: canLearn() });
});

router.post("/model-freeze/freeze", (req: Request, res: Response) => {
  const { actor = "api", reason = "Manual freeze via API", lockVersion = false } = req.body;
  const status = freezeModel({ actor, reason, lockVersion });
  return res.json({ ok: true, action: "frozen", ...status });
});

router.post("/model-freeze/unfreeze", (req: Request, res: Response) => {
  const { actor = "api" } = req.body;
  const status = unfreezeModel({ actor });
  return res.json({ ok: true, action: "unfrozen", ...status });
});

// ── 9. Validation Study Pipeline ─────────────────────────────────────────────

router.post("/study/smoke-run", async (_req: Request, res: Response) => {
  try {
    const result = await runSmokeStudy(async (input) => {
      const diffs = bayesDiff(input.symptoms, 1, 0);
      return { diagnosis: diffs[0]?.diagnosis ?? "unknown" };
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Study failed" });
  }
});

router.get("/study/status", (_req: Request, res: Response) => {
  res.json({
    ok:            true,
    active:        true,
    passThreshold: 0.85,
    description:   "FDA 510(k) SaMD validation pipeline with cohort-level accuracy, Wilson CI, and cryptographic audit",
  });
});

export default router;
