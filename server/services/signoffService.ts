import { firestoreSignoffStore } from "./firestoreSignoffStore";
import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import { firestoreRuntimeMetricsStore } from "./firestoreRuntimeMetrics";
import type { CreateSignoffInput } from "./firestoreSignoffStore";

export class SignoffService {

  async signoff(input: CreateSignoffInput) {
    const caseRecord = await firestoreCaseStore.getCase(input.caseId);
    if (!caseRecord) throw new Error(`Case ${input.caseId} not found`);

    const signoff = await firestoreSignoffStore.createSignoff(input);

    if (input.status === "APPROVED" || input.status === "APPROVED_WITH_EDITS") {
      await firestoreCaseStore.markSignedOff(input.caseId, signoff.signoffId);
    } else {
      await firestoreCaseStore.markOverridden(input.caseId, signoff.signoffId);
    }

    await firestoreCaseEventsStore.appendEvent({
      caseId: input.caseId,
      type: "SIGNOFF_COMPLETED",
      actorId: input.reviewerId,
      actorRole: "physician",
      summary: `Signoff ${input.status}`,
      payload: {
        signoffId: signoff.signoffId
      }
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "SIGNOFF_CREATED",
      caseId: input.caseId,
      complaintId: caseRecord.complaintId ?? input.caseId,
      reviewerId: input.reviewerId,
      disposition: input.finalDisposition
    });

    return signoff;
  }
}

export const signoffService = new SignoffService();
