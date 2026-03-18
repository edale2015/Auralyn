import { PackRepository } from "./packRepository";
import { InMemoryPackRepository } from "./inMemoryPackRepository";
import { GoogleSheetsPackRepository } from "./googleSheetsPackRepository";

let cached: PackRepository | null = null;

export function getPackRepository(): PackRepository {
  if (cached) return cached;

  const driver = process.env.PACK_REPO_DRIVER || "memory";

  if (driver === "google_sheets") {
    cached = new GoogleSheetsPackRepository();
    return cached;
  }

  cached = new InMemoryPackRepository();
  return cached;
}
