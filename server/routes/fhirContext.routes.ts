import { Router }              from "express";
import { requireReviewAuth }   from "../middleware/reviewAuth";
import { fetchPatientContext }  from "../integrations/ehr/fhirPatientContext";
import { prePopulateIntake }    from "../integrations/ehr/intakePrePopulationService";
import { assessPriorAuth }      from "../integrations/ehr/priorAuthSkeleton";
import { appendAuditEvent }     from "../governance/audit";

export const fhirContextRouter = Router();

// ── GET /api/ehr/context/:patientId ──────────────────────────────────────────
// Fetch full patient context from EHR. Physician-only.
// Query params: vendor (ecw|athena|epic|mock), token (Bearer token for ecw/epic)

fhirContextRouter.get(
  "/context/:patientId",
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
        actor:      (req as any).user?.id ?? "phys1",
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
          partial: ctx.partial,
        },
      }).catch(() => {});

      return res.json({ ok: true, context: ctx });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── POST /api/ehr/prepopulate ─────────────────────────────────────────────────
// Pre-populate intake answers from EHR. Returns patch for answers.structured.

fhirContextRouter.post(
  "/prepopulate",
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
          actor:      (req as any).user?.id ?? "system",
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

// ── POST /api/ehr/prior-auth ──────────────────────────────────────────────────
// Prior authorization assessment for proposed orders.

fhirContextRouter.post(
  "/prior-auth",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId, patientId, insuranceId, primaryDiagnosis, proposedOrders } = req.body;

      if (!caseId || !primaryDiagnosis || !proposedOrders?.length) {
        return res.status(400).json({
          ok:    false,
          error: "caseId, primaryDiagnosis, and proposedOrders are required",
        });
      }

      const assessment = await assessPriorAuth({
        caseId, patientId, insuranceId, primaryDiagnosis, proposedOrders,
      });

      await appendAuditEvent({
        actor:      (req as any).user?.id ?? "phys1",
        action:     "PRIOR_AUTH_ASSESSED",
        entityId:   caseId,
        entityType: "case",
        details: {
          overallStatus: assessment.overallStatus,
          orderCount:    proposedOrders.length,
          requiredCount: assessment.orders.filter((o: any) => o.authStatus === "required").length,
        },
      }).catch(() => {});

      return res.json({ ok: true, assessment });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/fhir/epic/authorize ──────────────────────────────────────────────
// Initiates Epic SMART on FHIR OAuth2 flow. Stores PKCE verifier in session.

fhirContextRouter.get(
  "/epic/authorize",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { makeEpicConnector } = await import("../integrations/ehr/epicConnector");
      const connector  = makeEpicConnector({ vendor: "epic" } as any);
      const state      = crypto.randomUUID();
      const launch     = req.query.launch as string | undefined;

      const { url, codeVerifier } = connector.buildAuthorizeUrl(state, launch);

      const sess = (req as any).session ?? {};
      sess[`epic_pkce_${state}`] = codeVerifier;
      (req as any).session = sess;

      return res.redirect(url);

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/fhir/epic/callback ───────────────────────────────────────────────
// Handles Epic OAuth2 callback. Exchanges code for access token.
// Production: store token in httpOnly session cookie, not in response body.

fhirContextRouter.get(
  "/epic/callback",
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
      const connector    = makeEpicConnector({ vendor: "epic" } as any);
      const codeVerifier = (req as any).session?.[`epic_pkce_${state}`];

      const tokenResponse = await connector.exchangeCodeForToken(code as string, codeVerifier);

      return res.json({
        ok:        true,
        message:   "Epic auth complete. Store access_token securely.",
        patientId: tokenResponse.patient,
        expiresIn: tokenResponse.expires_in,
      });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);
