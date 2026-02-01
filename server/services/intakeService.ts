import { db } from "../firebase";
import { Case, CaseStatus, createEmptyCase, generateCaseId } from "./caseModel";
import { computeProposalGeneric } from "../rules/computeProposalGeneric";

const CASES_COLLECTION = "cases";

export async function getCaseByToken(token: string): Promise<Case | null> {
  const snap = await db.collection(CASES_COLLECTION)
    .where("token", "==", token)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as Case;
}

export async function getCaseByCaseId(caseId: string): Promise<Case | null> {
  const doc = await db.collection(CASES_COLLECTION).doc(caseId).get();
  if (!doc.exists) return null;
  return doc.data() as Case;
}

export async function createCase(token: string, phone: string, flowId: string): Promise<Case> {
  const c = createEmptyCase(token, phone, flowId);
  await db.collection(CASES_COLLECTION).doc(c.caseId).set(c);
  return c;
}

export async function saveDraft(
  token: string,
  draft: Record<string, any>,
  currentStep: number
): Promise<{ ok: boolean; error?: string }> {
  const c = await getCaseByToken(token);
  if (!c) return { ok: false, error: "Case not found" };
  if (c.status !== "draft") return { ok: false, error: "Case already submitted" };

  const now = Date.now();
  await db.collection(CASES_COLLECTION).doc(c.caseId).update({
    "draft.data": draft,
    "draft.currentStep": currentStep,
    "draft.lastTouchedAt": now,
    updatedAt: now
  });

  return { ok: true };
}

export interface SubmitIntakeInput {
  answers: Record<string, any>;
  modifiers: Record<string, any>;
  meds: string[];
  allergies: string[];
  pmh: Record<string, any>;
  pharmacy: Record<string, any>;
  attachments: string[];
  consent: {
    telehealth: boolean;
    privacy: boolean;
    signatureName?: string;
  };
  chiefComplaint?: string;
}

export async function submitIntake(
  token: string,
  input: SubmitIntakeInput
): Promise<{ ok: boolean; caseId?: string; error?: string }> {
  const c = await getCaseByToken(token);
  if (!c) return { ok: false, error: "Case not found" };
  if (c.status !== "draft") return { ok: false, error: "Case already submitted" };

  const now = Date.now();

  let triageResult: any = {};
  try {
    triageResult = await computeProposalGeneric(input.answers, { flowId: c.flowId });
  } catch (e: any) {
    console.warn("Triage compute failed:", e?.message);
  }

  const redFlags = triageResult.redFlag
    ? Object.keys(input.answers).filter(k => input.answers[k] === "Yes" || input.answers[k] === true)
    : [];

  await db.collection(CASES_COLLECTION).doc(c.caseId).update({
    status: "submitted",
    updatedAt: now,
    intake: {
      chiefComplaint: input.chiefComplaint || "",
      answers: input.answers,
      modifiers: input.modifiers,
      pmh: input.pmh,
      meds: input.meds,
      allergies: input.allergies,
      pharmacy: input.pharmacy,
      attachments: input.attachments,
      consent: {
        ...input.consent,
        signedAt: now
      }
    },
    assistant: {
      triageLevel: triageResult.disposition || "pending_review",
      redFlags,
      draftDx: triageResult.rulePacks?.testPack ? [triageResult.rulePacks.testPack] : [],
      draftOrders: triageResult.rulePacks?.medPack ? [triageResult.rulePacks.medPack] : [],
      draftNote: triageResult.reasoning?.join("\n") || ""
    }
  });

  return { ok: true, caseId: c.caseId };
}

export async function getCaseStatus(token: string): Promise<{
  status: CaseStatus | null;
  caseId?: string;
  lastUpdatedAt?: number;
  nextActionText?: string;
} | null> {
  const c = await getCaseByToken(token);
  if (!c) return null;

  const statusText: Record<CaseStatus, string> = {
    draft: "Continue your intake form",
    submitted: "Waiting for provider review",
    in_review: "Provider is reviewing your case",
    signed: "Visit complete - view your summary",
    closed: "This visit has been closed"
  };

  return {
    status: c.status,
    caseId: c.caseId,
    lastUpdatedAt: c.updatedAt,
    nextActionText: statusText[c.status]
  };
}

export async function getCaseSummary(token: string): Promise<{
  ok: boolean;
  html?: string;
  error?: string;
}> {
  const c = await getCaseByToken(token);
  if (!c) return { ok: false, error: "Case not found" };
  if (c.status !== "signed") return { ok: false, error: "Visit summary not yet available" };

  const html = `
<!DOCTYPE html>
<html>
<head><title>Visit Summary - ${c.caseId}</title></head>
<body style="font-family: sans-serif; max-width: 800px; margin: 2rem auto; padding: 1rem;">
  <h1>Visit Summary</h1>
  <p><strong>Case ID:</strong> ${c.caseId}</p>
  <p><strong>Date:</strong> ${new Date(c.updatedAt).toLocaleDateString()}</p>
  
  <h2>Chief Complaint</h2>
  <p>${c.intake?.chiefComplaint || "Not specified"}</p>
  
  <h2>Assessment</h2>
  <p>${c.assistant?.draftNote || "See provider notes"}</p>
  
  <h2>Diagnosis</h2>
  <ul>${(c.assistant?.draftDx || []).map(d => `<li>${d}</li>`).join("") || "<li>Pending</li>"}</ul>
  
  <h2>Plan</h2>
  <ul>${(c.assistant?.draftOrders || []).map(o => `<li>${o}</li>`).join("") || "<li>See instructions</li>"}</ul>
  
  <hr>
  <p style="color: #666; font-size: 0.9rem;">This is an automated summary. Follow up with your provider for any questions.</p>
</body>
</html>
  `.trim();

  return { ok: true, html };
}

export async function addAttachment(
  token: string,
  fileId: string
): Promise<{ ok: boolean; error?: string }> {
  const c = await getCaseByToken(token);
  if (!c) return { ok: false, error: "Case not found" };
  if (c.status !== "draft") return { ok: false, error: "Cannot add attachments after submission" };

  const attachments = c.intake?.attachments || [];
  attachments.push(fileId);

  await db.collection(CASES_COLLECTION).doc(c.caseId).update({
    "intake.attachments": attachments,
    updatedAt: Date.now()
  });

  return { ok: true };
}
