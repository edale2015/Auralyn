import { ParsedSymptomPack } from "../../shared/packRows";

export function matchSymptomPack(
  chiefComplaint: string,
  packs: ParsedSymptomPack[]
): ParsedSymptomPack | null {
  const normalized = chiefComplaint.trim().toLowerCase();

  let best: { pack: ParsedSymptomPack; score: number } | null = null;

  for (const pack of packs) {
    let score = 0;

    if (pack.id.toLowerCase() === normalized) score += 100;
    if (pack.title.toLowerCase() === normalized) score += 90;

    for (const alias of pack.aliases) {
      const aliasNorm = alias.toLowerCase();
      if (normalized === aliasNorm) score += 80;
      if (normalized.includes(aliasNorm)) score += 50;
    }

    if (!best || score > best.score) {
      best = { pack, score };
    }
  }

  return best && best.score > 0 ? best.pack : null;
}
