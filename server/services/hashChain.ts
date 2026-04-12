import { createHash } from "crypto";

export interface HashRecord {
  id:        number;
  timestamp: string;
  data:      unknown;
  prevHash:  string;
  hash:      string;
}

class HashChain {
  private readonly chain: HashRecord[] = [];

  private computeHash(record: Omit<HashRecord, "hash">): string {
    return createHash("sha256")
      .update(JSON.stringify(record))
      .digest("hex");
  }

  add(data: unknown): HashRecord {
    const prev = this.chain[this.chain.length - 1];

    const partial: Omit<HashRecord, "hash"> = {
      id:        this.chain.length + 1,
      timestamp: new Date().toISOString(),
      data,
      prevHash:  prev?.hash ?? "GENESIS",
    };

    const hash = this.computeHash(partial);
    const record: HashRecord = { ...partial, hash };
    this.chain.push(record);
    return record;
  }

  /** Returns true if the chain is intact (no tampering detected). */
  verify(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const prev    = this.chain[i - 1];
      const current = this.chain[i];

      if (current.prevHash !== prev.hash) return false;

      const recalculated = this.computeHash({
        id:        current.id,
        timestamp: current.timestamp,
        data:      current.data,
        prevHash:  current.prevHash,
      });

      if (recalculated !== current.hash) return false;
    }
    return true;
  }

  getChain(): HashRecord[] { return this.chain; }

  length(): number { return this.chain.length; }

  latest(): HashRecord | undefined { return this.chain[this.chain.length - 1]; }
}

export const auditHashChain = new HashChain();
