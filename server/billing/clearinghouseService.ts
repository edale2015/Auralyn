import { build837P, type X12Claim, type X12_837P } from "./x12Mapper";

export interface ClearinghouseSubmission {
  claimId: string;
  clearinghouseId: string;
  status: "submitted" | "accepted" | "rejected" | "error";
  payload: X12_837P;
  submittedAt: string;
  error?: string;
}

const submissionLog: ClearinghouseSubmission[] = [];

export async function submitToClearinghouse(claim: X12Claim): Promise<ClearinghouseSubmission> {
  const payload = build837P(claim);

  const clearinghouseUrl = process.env.CLEARINGHOUSE_URL;
  const clearinghouseToken = process.env.CLEARINGHOUSE_TOKEN;

  if (clearinghouseUrl && clearinghouseToken) {
    try {
      const { default: axios } = await import("axios");
      const res = await axios.post(clearinghouseUrl, payload, {
        headers: {
          Authorization: `Bearer ${clearinghouseToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      const submission: ClearinghouseSubmission = {
        claimId: claim.claimId,
        clearinghouseId: res.data?.id || `CH-${Date.now()}`,
        status: "submitted",
        payload,
        submittedAt: new Date().toISOString(),
      };
      submissionLog.push(submission);
      return submission;
    } catch (err: any) {
      const submission: ClearinghouseSubmission = {
        claimId: claim.claimId,
        clearinghouseId: "",
        status: "error",
        payload,
        submittedAt: new Date().toISOString(),
        error: err.message,
      };
      submissionLog.push(submission);
      return submission;
    }
  }

  const submission: ClearinghouseSubmission = {
    claimId: claim.claimId,
    clearinghouseId: `SIM-${Date.now()}`,
    status: "submitted",
    payload,
    submittedAt: new Date().toISOString(),
  };
  submissionLog.push(submission);
  return submission;
}

export function getSubmissionLog(limit = 50): ClearinghouseSubmission[] {
  return submissionLog.slice(-limit);
}
