export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const lines = [
    headers.join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(",")),
  ];

  return lines.join("\n");
}
