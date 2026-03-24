import { auditLog } from "../security/auditLogger";
import type { Insurer } from "./contractPipeline";

export interface OutreachResult {
  payerId: string;
  method: "api" | "email_simulated";
  success: boolean;
  message: string;
  sentAt: string;
}

const outreachLog: OutreachResult[] = [];

function buildOutreachMessage(insurer: Insurer, proposedRate?: number): string {
  return `Hello ${insurer.name},

We are expanding our clinical network and would like to initiate contracting discussions with your organization.

Auralyn delivers AI-assisted, physician-supervised care with demonstrated outcomes:
• 94% patient satisfaction (Press Ganey top quartile)
• 18% lower ED utilization vs. national benchmarks
• Real-time FDA-compliant audit trail (21 CFR Part 11)
• Average visit disposition in under 4 minutes
${proposedRate ? `\nWe propose an initial rate of $${proposedRate}/visit for primary care services, with value-based bonus potential tied to STAR ratings.\n` : ""}
Please let us know the appropriate next steps for network participation.

Best regards,
Auralyn Network Operations
network@auralyn.com`;
}

export async function sendOutreach(insurer: Insurer): Promise<OutreachResult> {
  const sentAt = new Date().toISOString();
  const message = buildOutreachMessage(insurer, insurer.proposedRate);
  let success = false;
  let method: OutreachResult["method"] = "email_simulated";

  if (insurer.apiEndpoint) {
    try {
      const resp = await fetch(insurer.apiEndpoint, {
        method: "POST",
        body: JSON.stringify({ message, payerId: insurer.payerId }),
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      success = resp.ok;
      method = "api";
    } catch {
      success = false;
    }
  } else {
    console.log(`[OutreachBot] Simulating email to ${insurer.contactEmail ?? insurer.name}`);
    success = true;
  }

  const result: OutreachResult = { payerId: insurer.payerId, method, success, message, sentAt };
  outreachLog.push(result);

  auditLog({
    actor: "outreach_bot",
    action: "outreach_sent",
    details: { payerId: insurer.payerId, method, success },
  });

  return result;
}

export function getOutreachLog(limit = 50): OutreachResult[] {
  return outreachLog.slice(-limit);
}
