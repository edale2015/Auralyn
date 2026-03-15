export interface ImportedPath {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

export interface ImportResult {
  paths: ImportedPath[];
  nodeSet: string[];
  parseErrors: { line: number; raw: string; reason: string }[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '_');
}

export function clinicalPathImporter(text: string): ImportResult {
  const paths: ImportedPath[] = [];
  const parseErrors: { line: number; raw: string; reason: string }[] = [];
  const nodeSet = new Set<string>();

  const lines = text.split(/\n+/).filter((l) => l.trim().length > 0);

  lines.forEach((raw, idx) => {
    const line = raw.trim();

    // ── Skip comments ─────────────────────────────────────────────────────
    if (line.startsWith('#') || line.startsWith('//')) return;

    // ── Arrow formats: A -> B, A --> B, A -> B [label], A -> B [label, 0.8]
    const arrowMatch = line.match(/^(.+?)\s*-{1,2}>\s*(.+?)(?:\s*\[([^\]]+)\])?$/);
    if (arrowMatch) {
      const from = normalize(arrowMatch[1]);
      const to = normalize(arrowMatch[2]);
      const meta = arrowMatch[3];

      let label: string | undefined;
      let weight: number | undefined;

      if (meta) {
        const parts = meta.split(',');
        label = parts[0].trim();
        if (parts[1]) {
          const parsed = parseFloat(parts[1].trim());
          if (!isNaN(parsed)) weight = parsed;
        }
      }

      if (from && to) {
        paths.push({ from, to, label, weight });
        nodeSet.add(from);
        nodeSet.add(to);
      } else {
        parseErrors.push({ line: idx + 1, raw, reason: 'Empty node on either side of arrow' });
      }
      return;
    }

    // ── Pipe-separated CSV: from|to|label|weight ───────────────────────────
    const pipeMatch = line.split('|');
    if (pipeMatch.length >= 2) {
      const from = normalize(pipeMatch[0]);
      const to = normalize(pipeMatch[1]);
      const label = pipeMatch[2]?.trim();
      const weight = pipeMatch[3] ? parseFloat(pipeMatch[3]) : undefined;
      if (from && to) {
        paths.push({ from, to, label, weight: isNaN(weight ?? NaN) ? undefined : weight });
        nodeSet.add(from);
        nodeSet.add(to);
      }
      return;
    }

    parseErrors.push({ line: idx + 1, raw, reason: 'Unrecognized path format (expected: A -> B or A|B)' });
  });

  return {
    paths,
    nodeSet: [...nodeSet].sort(),
    parseErrors,
  };
}

export function parseComplaintProtocol(text: string): Record<string, string[]> {
  const protocol: Record<string, string[]> = {};
  const result = clinicalPathImporter(text);
  for (const path of result.paths) {
    if (!protocol[path.from]) protocol[path.from] = [];
    protocol[path.from].push(path.to);
  }
  return protocol;
}
