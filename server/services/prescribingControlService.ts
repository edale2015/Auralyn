export interface PrescribingRequest {
  caseId: string;
  medicationId: string;
  dose: string;
  duration: string;
  prescriberId: string;
  status: "pending" | "approved" | "denied";
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
}

const requests: PrescribingRequest[] = [];

export function createPrescribingRequest(input: Omit<PrescribingRequest, "status">): PrescribingRequest {
  const req: PrescribingRequest = { ...input, status: "pending" };
  requests.push(req);
  return req;
}

export function reviewPrescribingRequest(caseId: string, medicationId: string, approved: boolean, reviewerId: string, reason?: string): PrescribingRequest | null {
  const req = requests.find((r) => r.caseId === caseId && r.medicationId === medicationId);
  if (!req) return null;
  req.status = approved ? "approved" : "denied";
  req.reviewedBy = reviewerId;
  req.reviewedAt = new Date().toISOString();
  req.reason = reason;
  return req;
}

export function listPrescribingRequests(status?: string): PrescribingRequest[] {
  return requests.filter((r) => !status || r.status === status).reverse();
}
