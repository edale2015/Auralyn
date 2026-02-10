import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { TestCaseV1Schema, type TestCaseV1 } from "../../shared/testingTypes";

function getDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname !== "undefined" ? __dirname : process.cwd();
  }
}

function findTestcasesDir(): string {
  const thisDir = getDir();
  const candidates = [
    resolve(process.cwd(), "server/testcases"),
    resolve(thisDir, "."),
    resolve(thisDir, "../server/testcases"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir) && readdirSync(dir).some(f => f.endsWith(".json"))) {
      return dir;
    }
  }
  return resolve(process.cwd(), "server/testcases");
}

const TESTCASES_DIR = findTestcasesDir();

let cachedCases: TestCaseV1[] | null = null;

export function loadAllTestCases(): TestCaseV1[] {
  if (cachedCases) return cachedCases;

  const files = readdirSync(TESTCASES_DIR).filter(f => f.endsWith(".json"));
  const cases: TestCaseV1[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(TESTCASES_DIR, file), "utf-8"));
      const parsed = TestCaseV1Schema.parse(raw);
      cases.push(parsed);
    } catch (err) {
      console.warn(`[TestCaseLoader] Skipping ${file}:`, err);
    }
  }

  cachedCases = cases;
  return cases;
}

export function getTestCaseById(id: string): TestCaseV1 | undefined {
  const cases = loadAllTestCases();
  return cases.find(c => c.id === id || c.id.toLowerCase() === id.toLowerCase());
}

export function getTestCaseByFilename(name: string): TestCaseV1 | undefined {
  const filename = name.endsWith(".json") ? name : `${name}.json`;
  const filepath = join(TESTCASES_DIR, filename);
  try {
    const raw = JSON.parse(readFileSync(filepath, "utf-8"));
    return TestCaseV1Schema.parse(raw);
  } catch {
    return undefined;
  }
}

export function listTestCaseSummaries(): Array<{ id: string; label: string; complaint: string; tags: string[] }> {
  return loadAllTestCases().map(tc => ({
    id: tc.id,
    label: tc.label,
    complaint: tc.chiefComplaint,
    tags: tc.tags ?? [],
  }));
}

export function invalidateCache() {
  cachedCases = null;
}
