import * as fs from "fs/promises";
import * as path from "path";

const STORE_DIR = path.resolve(
  process.cwd(),
  "server/data/runtime/tenant_cases"
);

async function ensureDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function saveTenantCaseRecord(params: {
  siteId: string;
  caseId: string;
  complaintId?: string;
  disposition?: string;
  payload: Record<string, any>;
}) {
  await ensureDir();

  const filePath = path.join(
    STORE_DIR,
    `${params.siteId}__${params.caseId}.json`
  );
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        siteId: params.siteId,
        caseId: params.caseId,
        complaintId: params.complaintId ?? "",
        disposition: params.disposition ?? "",
        payload: params.payload,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );

  return { ok: true, filePath };
}

export async function listTenantCaseRecords(
  siteId = "default",
  limit = 50
): Promise<any[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(STORE_DIR);
    const matching = files
      .filter((f) => f.startsWith(`${siteId}__`) && f.endsWith(".json"))
      .slice(-limit);

    const records = await Promise.all(
      matching.map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(STORE_DIR, f), "utf8");
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
    );

    return records.filter(Boolean).reverse();
  } catch {
    return [];
  }
}
