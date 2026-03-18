interface RefinementMemory {
  [normalizedColumn: string]: string;
}

const refinementMemory: RefinementMemory = {};

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function applyRefinement(column: string): string | null {
  const key = normalize(column);
  return refinementMemory[key] || null;
}

export function recordCorrection(column: string, correctType: string) {
  const key = normalize(column);
  refinementMemory[key] = correctType;
}

export function getRefinementMemory(): Record<string, string> {
  return { ...refinementMemory };
}

export function clearRefinementMemory() {
  for (const key of Object.keys(refinementMemory)) {
    delete refinementMemory[key];
  }
}
