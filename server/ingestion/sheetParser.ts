export function parseSheetRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map((r) => {
    const cleaned: Record<string, any> = {};
    Object.entries(r).forEach(([k, v]) => {
      cleaned[String(k).trim()] = typeof v === "string" ? v.trim() : v;
    });
    return cleaned;
  });
}

export function extractColumn(rows: Record<string, any>[], column: string): string[] {
  return rows
    .map((r) => String(r[column] ?? "").trim())
    .filter((v) => v.length > 0);
}
