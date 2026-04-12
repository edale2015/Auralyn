import { createSession, listPendingReviews, getSession, closeSession } from "../session/sessionManager";
import { clinicalAgentLoop } from "../engine/clinicalAgentLoop";
import { physicianOverrideCheck } from "../governance/override";
import { finalizeVisit } from "./finalize";
import type { FinalVisitOutput } from "./finalize";

export type TelemedStatus = "complete" | "physician_review" | "error";

export interface TelemedVisitResult {
  status:    TelemedStatus;
  sessionId: string;
  aiResult?: Awaited<ReturnType<typeof clinicalAgentLoop>>;
  final?:    FinalVisitOutput;
  override?: ReturnType<typeof physicianOverrideCheck>;
  error?:    string;
}

export async function runTelemedVisit(patientInput: {
  patientId:    string;
  complaint:    string;
  features?:    Record<string, unknown>;
  riskScore?:   number;
  probability?: number;
  centorScore?: number;
}): Promise<TelemedVisitResult> {
  const session = await createSession({
    patientId:    patientInput.patientId,
    complaint:    patientInput.complaint,
    initialState: {
      features:    patientInput.features    ?? {},
      riskScore:   patientInput.riskScore   ?? 0.3,
      probability: patientInput.probability ?? 0.3,
      centorScore: patientInput.centorScore ?? 0,
    },
  });

  try {
    const aiResult = await clinicalAgentLoop(session);

    const clinicalScore = (aiResult.finalState.clinicalScore as any) ?? {};
    const dispositionResult = (aiResult.finalState.dispositionResult as any) ?? {};

    const override = physicianOverrideCheck({
      confidence:        clinicalScore.confidence,
      red_flags_present: (aiResult.finalState.redFlags as string[])?.length > 0,
      finalDecision:     clinicalScore.finalDecision,
      riskScore:         patientInput.riskScore ?? 0.3,
      centorScore:       clinicalScore.centorScore ?? patientInput.centorScore,
      probability:       clinicalScore.probability ?? patientInput.probability,
    });

    if (override.requireReview) {
      closeSession(session.id, "physician_review");
      return {
        status:    "physician_review",
        sessionId: session.id,
        aiResult,
        override,
      };
    }

    closeSession(session.id, "complete");

    const final = finalizeVisit({
      session:    { id: session.id },
      finalState: aiResult.finalState,
      trace:      aiResult.trace,
      disposition: dispositionResult.finalDisposition,
    });

    return { status: "complete", sessionId: session.id, aiResult, final };
  } catch (err: any) {
    closeSession(session.id, "abandoned");
    return {
      status:    "error",
      sessionId: session.id,
      error:     err?.message ?? "Telemed visit failed",
    };
  }
}

export async function getPendingPhysicianReviews(): Promise<ReturnType<typeof listPendingReviews>> {
  return listPendingReviews();
}

export async function approvePhysicianDecision(
  sessionId: string,
  physicianDecision: string
): Promise<FinalVisitOutput> {
  const session = getSession(sessionId);
  closeSession(sessionId, "complete");

  return finalizeVisit({
    session:    { id: sessionId },
    finalState: session?.state ?? {},
    trace:      [],
    disposition: physicianDecision,
  });
}
