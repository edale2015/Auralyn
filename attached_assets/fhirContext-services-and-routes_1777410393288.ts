// ─────────────────────────────────────────────────────────────────────────────
// FILE 1: server/integrations/ehr/ehrRegistry.patch.ts
// This is a PATCH — apply the changes described to your existing ehrRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────

/*
CHANGE 1: Add Epic import at top of ehrRegistry.ts

  import { makeEpicConnector } from "./epicConnector";

CHANGE 2: Fix getEhrConnector() switch — replace the "athena" throw and add "epic":

  export function getEhrConnector(config: EhrConfig): EhrConnector {
    switch (config.vendor) {
      case "ecw":
        return makeEcwConnector(config);
      case "epic":
        return makeEpicConnector(config);           // ← ADD THIS
      case "athena":
        // Athena uses proprietary REST, not EhrConnector interface.
        // Use fetchPatientContext({ vendor: "athena", ... }) directly instead.
        throw new Error(
          "Athena does not implement EhrConnector. " +
          "Use fetchPatientContext({ vendor: 'athena' }) from fhirPatientContext.ts"
        );
      default:
        throw new Error(`Unknown EHR vendor: ${(config as any).vendor}`);
    }
  }
*/


// ─────────────────────────────────────────────────────────────────────────────
// FILE 2: server/integrations/ehr/intakePrePopulationService.ts
// Drop into: server/integrations/ehr/intakePrePopulationService.ts
//
// Part 2 of 3: Intake Pre-Population
// Fetches PatientContext and patches answers.structured before the AI runs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * intakePrePopulationService.ts
 *
 * Called during intake when a patient's EHR identity is known.
 * Fetches their clinical context and merges it into answers.structured
 * so the AI triage engine starts with verified data rather than self-report.
 *
 * Safe merge rules:
 *   - Patient self-report WINS over EHR for symptom questions (patient knows how they feel)
 *   - EHR data WINS for medications, allergies, conditions (patients frequently omit/misreport)
 *   - Demographics filled from EHR only if not already present in answers.structured
 *   - All EHR-sourced fields are tagged with _source: "ehr" for audit visibility
 */

import { fetchPatientContext, EhrVendor, PatientContext } from "./fhirPatientContext";

export interface PrePopulationResult {
  success:       boolean;
  patientContext?: PatientContext;
  patch:         Record<string, any>;   // merge into answers.structured
  fieldsAdded:   string[];
  errors:        string[];
}

export async function prePopulateIntake({
  patientId,
  vendor,
  accessToken,
  existingAnswers = {},
}: {
  patientId:       string;
  vendor:          EhrVendor;
  accessToken?:    string;
  existingAnswers?: Record<string, any>;
}): Promise<PrePopulationResult> {

  const errors:     string[] = [];
  const fieldsAdded: string[] = [];
  const patch:      Record<string, any> = {};

  let ctx: PatientContext;

  try {
    ctx = await fetchPatientContext({ vendor, patientId, accessToken });
  } catch (err: any) {
    return {
      success:   false,
      patch:     {},
      fieldsAdded: [],
      errors:    [`Context fetch failed: ${err.message}`],
    };
  }

  if (ctx.errors.length > 0) {
    errors.push(...ctx.errors);
  }

  const ip = ctx.intakePatch;

  // ── Demographics — fill only if not already present ──────────────────────
  const demographicFields: Array<[string, any]> = [
    ["name",  ip.name],
    ["dob",   ip.dob],
    ["age",   ip.age],
    ["sex",   ip.sex],
  ];

  for (const [key, value] of demographicFields) {
    if (value !== undefined && !existingAnswers[key]) {
      patch[key]                   = value;
      patch[`${key}_source`]       = "ehr";
      fieldsAdded.push(key);
    }
  }

  // ── Medications — EHR wins, merge with any patient-reported meds ─────────
  if (ip.medications.length > 0) {
    const existing = Array.isArray(existingAnswers.medications)
      ? existingAnswers.medications
      : [];
    // Deduplicate by lowercased first word (drug name)
    const ehrNames = new Set(ip.medications.map(m => m.split(" ")[0].toLowerCase()));
    const filtered = existing.filter(
      (m: string) => !ehrNames.has(m.split(" ")[0].toLowerCase())
    );
    patch.medications        = [...ip.medications, ...filtered];
    patch.medications_source = "ehr_merged";
    fieldsAdded.push("medications");
  }

  // ── Allergies — EHR wins ─────────────────────────────────────────────────
  if (ip.allergies.length > 0) {
    patch.allergies        = ip.allergies;
    patch.allergies_source = "ehr";
    fieldsAdded.push("allergies");
  }

  // ── Conditions — EHR wins ────────────────────────────────────────────────
  if (ip.conditions.length > 0) {
    patch.conditions        = ip.conditions;
    patch.conditions_source = "ehr";
    fieldsAdded.push("conditions");
  }

  // ── Metadata ─────────────────────────────────────────────────────────────
  patch._ehr_prepopulated = true;
  patch._ehr_vendor       = vendor;
  patch._ehr_patient_id   = patientId;
  patch._ehr_fetched_at   = ctx.fetchedAt;

  return {
    success:       true,
    patientContext: ctx,
    patch,
    fieldsAdded,
    errors,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE 3: server/integrations/ehr/priorAuthSkeleton.ts
// Drop into: server/integrations/ehr/priorAuthSkeleton.ts
//
// Part 3 of 3: Prior Authorization Skeleton
// Takes a case's diagnosis and proposed orders, checks against CMS coverage
// rules (stub), and returns a structured prior auth assessment.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * priorAuthSkeleton.ts
 *
 * SKELETON — deterministic stub returning structured prior auth assessment.
 * Replace the STUB_CMS_RULES lookup with a real CMS Coverage Database
 * query when the Claude for Healthcare CMS connector is available to your org.
 *
 * Production path:
 *   Claude for Healthcare now includes a CMS Coverage Database connector.
 *   Enterprise/HIPAA orgs can query it via the Anthropic API with the
 *   healthcare connector enabled. Replace getRulesForCode() with an
 *   API call to that connector.
 */

export interface PriorAuthRequest {
  caseId:            string;
  patientId?:        string;
  insuranceId?:      string;
  primaryDiagnosis:  string;   // ICD-10 code
  proposedOrders: Array<{
    type:    "lab" | "imaging" | "referral" | "prescription" | "procedure";
    code?:   string;           // CPT or NDC code
    display: string;
  }>;
}

export interface PriorAuthAssessment {
  caseId:          string;
  overallStatus:   "approved" | "likely_required" | "required" | "unknown";
  orders: Array<{
    display:        string;
    code?:          string;
    authStatus:     "not_required" | "likely_required" | "required" | "unknown";
    rationale:      string;
    documentationNeeded?: string[];
  }>;
  summary:         string;
  disclaimer:      string;
  generatedAt:     string;
}

// Stub rules — replace with CMS connector call in production
const STUB_PRIOR_AUTH_RULES: Record<string, {
  required: boolean;
  rationale: string;
  docs?: string[];
}> = {
  // Labs — generally not prior auth required
  "80053": { required: false, rationale: "Comprehensive metabolic panel — typically not prior auth required" },
  "85025": { required: false, rationale: "CBC — typically not prior auth required" },
  "83036": { required: false, rationale: "HbA1c — typically not prior auth required" },

  // Imaging — often prior auth required
  "70553": { required: true,  rationale: "MRI brain with contrast — most plans require prior auth",
             docs: ["Clinical indication", "Neurological exam findings", "Conservative treatment tried"] },
  "71250": { required: true,  rationale: "CT chest — prior auth required by most plans",
             docs: ["Clinical indication", "Relevant symptoms", "Supporting labs"] },
  "73721": { required: true,  rationale: "MRI joint — prior auth required",
             docs: ["Injury mechanism", "Conservative treatment record (6 weeks PT)", "X-ray results"] },

  // Referrals
  "referral_cardiology":         { required: true,  rationale: "Cardiology referral — most HMO/EPO plans require PCP referral or prior auth",
                                   docs: ["EKG", "Clinical notes", "PCP referral letter"] },
  "referral_neurology":          { required: true,  rationale: "Neurology referral — prior auth commonly required",
                                   docs: ["Clinical notes", "Relevant imaging"] },
  "referral_gastroenterology":   { required: true,  rationale: "GI referral — prior auth commonly required" },
  "referral_general":            { required: false, rationale: "General referral — auth requirements vary by plan" },

  // Common prescriptions
  "ozempic":        { required: true,  rationale: "GLP-1 agonist — most plans require prior auth for obesity/T2DM indication",
                      docs: ["BMI documentation", "Failed first-line therapy", "Comorbidity documentation"] },
  "humira":         { required: true,  rationale: "Biologic — prior auth always required",
                      docs: ["Diagnosis confirmation", "Failed conventional therapy", "Step therapy documentation"] },
};

function getRulesForOrder(order: PriorAuthRequest["proposedOrders"][0]) {
  // Check by CPT code first, then by type+display
  const codeKey = order.code ?? "";
  if (STUB_PRIOR_AUTH_RULES[codeKey]) return STUB_PRIOR_AUTH_RULES[codeKey];

  // Referral type lookup by specialty keyword
  if (order.type === "referral") {
    const slug = order.display.toLowerCase().replace(/\s+/g, "_");
    const match = Object.keys(STUB_PRIOR_AUTH_RULES).find(k =>
      k.startsWith("referral_") && slug.includes(k.replace("referral_", ""))
    );
    if (match) return STUB_PRIOR_AUTH_RULES[match];
    return STUB_PRIOR_AUTH_RULES["referral_general"];
  }

  // Imaging fallback
  if (order.type === "imaging") {
    return { required: true, rationale: "Imaging orders frequently require prior auth — verify with payer", docs: ["Clinical indication"] };
  }

  // Lab fallback
  if (order.type === "lab") {
    return { required: false, rationale: "Most lab orders do not require prior auth — verify for specialty labs" };
  }

  return { required: false, rationale: "Prior auth requirements unknown — verify with payer" };
}

export async function assessPriorAuth(
  request: PriorAuthRequest
): Promise<PriorAuthAssessment> {
  const orders = request.proposedOrders.map(order => {
    const rules = getRulesForOrder(order);
    return {
      display:             order.display,
      code:                order.code,
      authStatus:          rules.required ? "required" as const : "not_required" as const,
      rationale:           rules.rationale,
      documentationNeeded: rules.docs,
    };
  });

  const requiredCount = orders.filter(o => o.authStatus === "required").length;
  const overallStatus =
    requiredCount === 0       ? "approved" :
    requiredCount === orders.length ? "required" : "likely_required";

  const summary = requiredCount === 0
    ? "No prior authorization appears required for the proposed orders."
    : `${requiredCount} of ${orders.length} proposed order(s) likely require prior authorization. Review documentation requirements before ordering.`;

  return {
    caseId:        request.caseId,
    overallStatus,
    orders,
    summary,
    disclaimer:    "This is an AI-generated preliminary assessment based on general coverage patterns. Actual prior authorization requirements depend on the specific payer, plan, and patient policy. Always verify with the payer before ordering.",
    generatedAt:   new Date().toISOString(),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE 4: server/routes/fhirContext.routes.ts
// Drop into: server/routes/fhirContext.routes.ts
//
// REST API for all three FHIR context features.
// Register in server/index.ts: app.use(fhirContextRouter)
// ─────────────────────────────────────────────────────────────────────────────

import { Router }            from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { fetchPatientContext } from "../integrations/ehr/fhirPatientContext";
import { prePopulateIntake }   from "../integrations/ehr/intakePrePopulationService";
import { assessPriorAuth }     from "../integrations/ehr/priorAuthSkeleton";
import { appendAuditEvent }    from "../governance/audit";

export const fhirContextRouter = Router();

// ── GET /api/fhir/context/:patientId ─────────────────────────────────────────
// Fetch full patient context from EHR. Physician-only.
// Query params: vendor (ecw|athena|epic|mock), token (Bearer token for ecw/epic)

fhirContextRouter.get(
  "/api/fhir/context/:patientId",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { patientId } = req.params;
      const vendor  = (req.query.vendor as string) ?? "mock";
      const token   = req.query.token as string | undefined;

      const ctx = await fetchPatientContext({
        vendor:      vendor as any,
        patientId,
        accessToken: token,
      });

      await appendAuditEvent({
        actor:      req.user?.id ?? "phys1",
        action:     "FHIR_CONTEXT_FETCHED",
        entityId:   patientId,
        entityType: "patient",
        details: {
          vendor,
          fieldsReturned: {
            medications: ctx.medications.length,
            allergies:   ctx.allergies.length,
            conditions:  ctx.conditions.length,
            labs:        ctx.labs.length,
          },
          partial:  ctx.partial,
          // No PHI in audit details
        },
      }).catch(() => {});

      return res.json({ ok: true, context: ctx });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── POST /api/fhir/prepopulate ────────────────────────────────────────────────
// Pre-populate intake answers from EHR. Called during intake flow.
// Returns a patch object to merge into answers.structured.

fhirContextRouter.post(
  "/api/fhir/prepopulate",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { patientId, vendor, accessToken, existingAnswers } = req.body;

      if (!patientId) {
        return res.status(400).json({ ok: false, error: "patientId required" });
      }

      const result = await prePopulateIntake({
        patientId,
        vendor:          vendor ?? "mock",
        accessToken,
        existingAnswers: existingAnswers ?? {},
      });

      if (result.success) {
        await appendAuditEvent({
          actor:      req.user?.id ?? "system",
          action:     "INTAKE_PREPOPULATED_FROM_EHR",
          entityId:   patientId,
          entityType: "patient",
          details: {
            vendor,
            fieldsAdded: result.fieldsAdded,
            partial:     result.errors.length > 0,
          },
        }).catch(() => {});
      }

      return res.json({ ok: true, ...result });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── POST /api/fhir/prior-auth ─────────────────────────────────────────────────
// Prior authorization assessment for proposed orders.

fhirContextRouter.post(
  "/api/fhir/prior-auth",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId, patientId, insuranceId, primaryDiagnosis, proposedOrders } = req.body;

      if (!caseId || !primaryDiagnosis || !proposedOrders?.length) {
        return res.status(400).json({
          ok: false,
          error: "caseId, primaryDiagnosis, and proposedOrders are required",
        });
      }

      const assessment = await assessPriorAuth({
        caseId, patientId, insuranceId, primaryDiagnosis, proposedOrders,
      });

      await appendAuditEvent({
        actor:      req.user?.id ?? "phys1",
        action:     "PRIOR_AUTH_ASSESSED",
        entityId:   caseId,
        entityType: "case",
        details: {
          overallStatus:  assessment.overallStatus,
          orderCount:     proposedOrders.length,
          requiredCount:  assessment.orders.filter((o: any) => o.authStatus === "required").length,
        },
      }).catch(() => {});

      return res.json({ ok: true, assessment });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/fhir/epic/authorize ──────────────────────────────────────────────
// Initiates Epic SMART on FHIR OAuth2 flow. Redirects to Epic login.
// Stores codeVerifier in session keyed by state for PKCE.

fhirContextRouter.get(
  "/api/fhir/epic/authorize",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { makeEpicConnector } = await import("../integrations/ehr/epicConnector");
      const connector = makeEpicConnector({ vendor: "epic" } as any);
      const state     = crypto.randomUUID();
      const launch    = req.query.launch as string | undefined;

      const { url, codeVerifier } = connector.buildAuthorizeUrl(state, launch);

      // Store verifier in session (requires express-session middleware)
      (req as any).session = (req as any).session ?? {};
      (req as any).session[`epic_pkce_${state}`] = codeVerifier;

      return res.redirect(url);

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/fhir/epic/callback ───────────────────────────────────────────────
// Handles Epic OAuth2 callback. Exchanges code for token.
// In production: store token in session or encrypted cookie, not in response.

fhirContextRouter.get(
  "/api/fhir/epic/callback",
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.status(400).json({ ok: false, error: `Epic auth error: ${error}` });
      }

      if (!code || !state) {
        return res.status(400).json({ ok: false, error: "Missing code or state" });
      }

      const { makeEpicConnector } = await import("../integrations/ehr/epicConnector");
      const connector   = makeEpicConnector({ vendor: "epic" } as any);
      const codeVerifier = (req as any).session?.[`epic_pkce_${state}`];

      const tokenResponse = await connector.exchangeCodeForToken(
        code as string,
        codeVerifier
      );

      // In production: store tokenResponse.access_token in httpOnly session cookie
      // For skeleton: return it so you can test with Postman/curl
      return res.json({
        ok:          true,
        message:     "Epic auth complete. Store access_token securely.",
        patientId:   tokenResponse.patient,
        expiresIn:   tokenResponse.expires_in,
        // access_token intentionally NOT logged — would be PHI in audit chain
      });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);
