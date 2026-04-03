/**
 * PHI scanner for Google Sheets content loaded into the clinical pipeline.
 * 
 * Addresses Claude Q7: "PHI flowing to Google Sheets is the most likely
 * unintentional HIPAA violation in the current architecture."
 * 
 * Scans configuration templates loaded from Sheets using the same 18-identifier
 * detection logic as the PHI guard middleware. Halts cache load if PHI detected.
 */

const PHI_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "mrn_keyword", pattern: /\b(?:mrn|medical\s+record\s+number)\b/i },
  { name: "dob_date", pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/ },
  { name: "email", pattern: /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/ },
  { name: "phone_10digit", pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/ },
  { name: "phone_plain", pattern: /\b\d{10}\b/ },
  { name: "address_keyword", pattern: /\b(?:address|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|lane|ln)\b/i },
  { name: "patient_name_hint", pattern: /\b(?:patient|pt)\s+(?:[A-Z][a-z]+){1,3}\b/ },
  { name: "full_name_heuristic", pattern: /\b(?:[A-Z][a-z]+)\s+(?:[A-Z][a-z]+)\b/ },
  { name: "npi", pattern: /\bnpi\s*[:#]?\s*\d{10}\b/i },
  { name: "dea_number", pattern: /\b[A-Z]{2}\d{7}\b/ },
  { name: "zip_plus4", pattern: /\b\d{5}-\d{4}\b/ },
  { name: "ip_address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { name: "account_number", pattern: /\baccount\s*(?:no|number|#)\s*:?\s*\d+\b/i },
];

export interface PhiScanHit {
  fieldPath: string;
  patternName: string;
  excerpt: string;
}

export interface PhiScanResult {
  clean: boolean;
  hits: PhiScanHit[];
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function scanString(value: string, fieldPath: string): PhiScanHit[] {
  const hits: PhiScanHit[] = [];
  for (const { name, pattern } of PHI_PATTERNS) {
    if (pattern.test(value)) {
      hits.push({ fieldPath, patternName: name, excerpt: truncate(value) });
    }
  }
  return hits;
}

export function scanStructuredContentForPhi(
  value: unknown,
  path = "$"
): PhiScanHit[] {
  if (typeof value === "string") {
    return scanString(value, path);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      scanStructuredContentForPhi(item, `${path}[${i}]`)
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      scanStructuredContentForPhi(v, `${path}.${k}`)
    );
  }
  return [];
}

/**
 * Throws if PHI is detected in Sheets content — halts cache load.
 * Per Claude Q7: "Do not load PHI-containing configuration into the clinical pipeline
 * under any circumstance."
 */
export function assertNoPhiInSheetsContent(
  content: unknown,
  sheetName: string
): void {
  const hits = scanStructuredContentForPhi(content);
  if (hits.length > 0) {
    console.error(
      `[PHIScanner] PHI detected in Google Sheets content — sheet: ${sheetName}. ` +
      `Hits: ${JSON.stringify(hits.slice(0, 5))}. Cache load HALTED.`
    );
    throw Object.assign(
      new Error(
        `PHI_DETECTED_IN_SHEETS_CONTENT: Sheet "${sheetName}" contains possible PHI. ` +
        `Cache load halted. Review sheet content and remove all patient-identifiable data.`
      ),
      {
        sheetName,
        hitCount: hits.length,
        hits: hits.slice(0, 10),
        code: "PHI_IN_SHEETS_CONTENT",
        statusCode: 500,
      }
    );
  }
}

/**
 * Non-throwing version — returns scan result and logs WARN if PHI found.
 * Use when you want to log but not halt (e.g. for monitoring dashboards).
 */
export function scanAndWarn(content: unknown, sheetName: string): PhiScanResult {
  const hits = scanStructuredContentForPhi(content);
  if (hits.length > 0) {
    console.warn(
      `[PHIScanner] PHI-ALERT in sheet "${sheetName}" — ${hits.length} pattern hit(s). ` +
      `Patterns: ${[...new Set(hits.map(h => h.patternName))].join(", ")}`
    );
  }
  return { clean: hits.length === 0, hits };
}
