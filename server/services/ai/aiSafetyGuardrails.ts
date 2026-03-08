export interface GuardrailResult {
  safe: boolean;
  flags: string[];
  filtered: boolean;
  originalLength: number;
  filteredLength: number;
}

const BLOCKED_PATTERNS = [
  /prescribe\s+\w+\s+without/i,
  /ignore\s+(safety|medical|clinical)/i,
  /override\s+physician/i,
];

const PHI_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z]\d{4,}\b/,
];

export function checkSafety(content: string): GuardrailResult {
  const flags: string[] = [];

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) flags.push(`Blocked pattern detected: ${pattern.source}`);
  }

  for (const pattern of PHI_PATTERNS) {
    if (pattern.test(content)) flags.push("Potential PHI detected");
  }

  if (content.length > 10000) flags.push("Content exceeds maximum length");

  return {
    safe: flags.length === 0,
    flags,
    filtered: flags.length > 0,
    originalLength: content.length,
    filteredLength: content.length,
  };
}
