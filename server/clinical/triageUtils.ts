export function requireModifiers(m: {
  age?: number;
  allergies?: string[];
  meds?: string[];
  [key: string]: unknown;
}): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!m.age) missing.push("age");
  if (!m.allergies || m.allergies.length === 0) missing.push("allergies");
  if (!m.meds || m.meds.length === 0) missing.push("medications");
  return { ok: missing.length === 0, missing };
}

export function quickView(caseData: {
  complaint?: string;
  risk?: string;
  disposition?: string;
  [key: string]: unknown;
}): string {
  return `${caseData.complaint ?? "?"} | ${caseData.risk ?? "?"} | ${caseData.disposition ?? "?"}`;
}

export function autoRepairTemplate(tpl: { steps?: Array<{ selector?: string; [key: string]: any }> }, err: string): typeof tpl {
  if (err.includes("selector") && Array.isArray(tpl.steps)) {
    tpl.steps = tpl.steps.map((s: any) => ({
      ...s,
      selector: s.selector?.replace("#", "[name="),
    }));
  }
  return tpl;
}

export function adaptiveQuestions(ctx: { complaint?: string }): string[] {
  const tree: Record<string, string[]> = {
    chest_pain: ["radiation?", "duration?", "exertion?"],
    fever:      ["temp?", "duration?", "sick contacts?"],
    cough:      ["duration?", "productive?", "fever?"],
  };
  return tree[ctx.complaint ?? ""] ?? [];
}

export function approveDisposition(caseId: string): void {
  console.log(`[Disposition] Approved: ${caseId}`);
}

export function autoEscalate(caseData: { risk?: string; [key: string]: unknown }): string | null {
  if (caseData.risk === "high") return "Notify physician immediately";
  return null;
}

export function trackInteraction(start: number): number {
  return Date.now() - start;
}

export async function integrationStatus(): Promise<Record<string, string>> {
  return {
    chatgpt:  "ok",
    telegram: "ok",
    whatsapp: "ok",
    ecw:      "ok",
  };
}
