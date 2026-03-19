export interface ClaimStatusResult {
  claimId: string;
  status: "pending" | "accepted" | "rejected" | "paid" | "denied" | "unknown";
  payer?: string;
  amountPaid?: string;
  denialReason?: string;
  checkedAt: string;
}

export async function checkClaimStatus(claimId: string): Promise<ClaimStatusResult> {
  const clearinghouseUrl = process.env.CLEARINGHOUSE_URL;
  const clearinghouseToken = process.env.CLEARINGHOUSE_TOKEN;

  if (clearinghouseUrl && clearinghouseToken) {
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${clearinghouseUrl}/status/${claimId}`, {
        headers: { Authorization: `Bearer ${clearinghouseToken}` },
        timeout: 15000,
      });

      return {
        claimId,
        status: res.data?.status || "unknown",
        payer: res.data?.payer,
        amountPaid: res.data?.amountPaid,
        denialReason: res.data?.denialReason,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        claimId,
        status: "unknown",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  return {
    claimId,
    status: "pending",
    checkedAt: new Date().toISOString(),
  };
}
