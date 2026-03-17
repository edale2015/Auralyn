import crypto from "crypto";

export interface AuditChainEntry {
  index: number;
  timestamp: string;
  caseId: string;
  userId: string;
  action: string;
  payload: any;
  previousHash: string;
  hash: string;
}

function computeHash(entry: Omit<AuditChainEntry, "hash">): string {
  const serialized = JSON.stringify(entry);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export class ImmutableAuditChain {
  private chain: AuditChainEntry[] = [];

  constructor() { this.seed(); }

  private seed() {
    this.append("case_001", "dr_williams", "batch_approve", { aiSuggestion: "Strep Throat", finalDecision: "Strep Throat", override: false });
    this.append("case_002", "dr_chen", "override", { aiSuggestion: "Sinusitis", finalDecision: "Peritonsillar Abscess", override: true, reason: "Missed abscess signs" });
    this.append("case_003", "dr_williams", "batch_approve", { aiSuggestion: "BPPV", finalDecision: "BPPV", override: false });
    this.append("case_004", "dr_martinez", "review", { aiSuggestion: "Otitis Media", finalDecision: "Otitis Media", override: false });
    this.append("case_005", "dr_chen", "escalate", { reason: "HIGH risk — chest pain symptoms", escalatedTo: "dr_williams" });
  }

  append(caseId: string, userId: string, action: string, payload: any): AuditChainEntry {
    const previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : "0".repeat(64);
    const entry: Omit<AuditChainEntry, "hash"> = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      caseId,
      userId,
      action,
      payload,
      previousHash,
    };
    const hash = computeHash(entry);
    const fullEntry = { ...entry, hash };
    this.chain.push(fullEntry);
    return fullEntry;
  }

  verify(): { valid: boolean; brokenAt?: number } {
    for (let i = 1; i < this.chain.length; i++) {
      if (this.chain[i].previousHash !== this.chain[i - 1].hash) return { valid: false, brokenAt: i };
      const { hash, ...rest } = this.chain[i];
      if (computeHash(rest) !== hash) return { valid: false, brokenAt: i };
    }
    return { valid: true };
  }

  getChain(): AuditChainEntry[] { return this.chain.map((e) => ({ ...e })); }
  getLength(): number { return this.chain.length; }

  getSummary() {
    const integrity = this.verify();
    return {
      length: this.chain.length,
      integrity,
      latestHash: this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : null,
      actions: {
        approve: this.chain.filter((e) => e.action.includes("approve")).length,
        override: this.chain.filter((e) => e.action === "override").length,
        escalate: this.chain.filter((e) => e.action === "escalate").length,
        review: this.chain.filter((e) => e.action === "review").length,
      },
    };
  }
}

export const auditChain = new ImmutableAuditChain();
