import crypto from "crypto";
import { auditChain, AuditChainEntry } from "./auditChain";

export interface ExportedAuditPacket {
  exportedAt: string;
  exportedBy: string;
  chainLength: number;
  integrityStatus: "verified" | "broken";
  brokenAt?: number;
  genesisHash: string;
  finalHash: string;
  exportHash: string;
  entries: AuditChainEntry[];
}

export function buildAuditExport(userId: string): ExportedAuditPacket {
  const chain = auditChain.getChain();
  const integrity = auditChain.verify();

  const genesisHash = chain.length > 0 ? chain[0].hash : "";
  const finalHash = chain.length > 0 ? chain[chain.length - 1].hash : "";

  const exportPayload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    chainLength: chain.length,
    genesisHash,
    finalHash,
    entries: chain,
  });

  const exportHash = crypto.createHash("sha256").update(exportPayload).digest("hex");

  return {
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    chainLength: chain.length,
    integrityStatus: integrity.valid ? "verified" : "broken",
    brokenAt: integrity.brokenAt,
    genesisHash,
    finalHash,
    exportHash,
    entries: chain,
  };
}

export function verifyExportIntegrity(packet: ExportedAuditPacket): { valid: boolean; reason: string } {
  if (packet.entries.length === 0) return { valid: true, reason: "Empty chain" };

  for (let i = 1; i < packet.entries.length; i++) {
    if (packet.entries[i].previousHash !== packet.entries[i - 1].hash) {
      return { valid: false, reason: `Chain broken at index ${i}` };
    }
  }

  if (packet.entries[0].hash !== packet.genesisHash) {
    return { valid: false, reason: "Genesis hash mismatch" };
  }

  if (packet.entries[packet.entries.length - 1].hash !== packet.finalHash) {
    return { valid: false, reason: "Final hash mismatch" };
  }

  return { valid: true, reason: "All hashes verified" };
}
