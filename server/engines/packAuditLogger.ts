import crypto from "crypto";
import { PackAuditLogRow } from "../../shared/packAuditRows";
import { getPackRepository } from "../repos/getPackRepository";

export async function appendPackAuditLog(input: Omit<PackAuditLogRow, "id" | "at">) {
  const repo = getPackRepository();
  const row: PackAuditLogRow = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...input,
  };

  await repo.appendAuditRow(row);
  return row;
}
