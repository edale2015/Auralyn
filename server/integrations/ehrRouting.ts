import type { EhrSystem } from "./ehr/types";

export function routeEHR(patient: { system?: string; tenantId?: string; payer?: string }): EhrSystem | "all" {
  const sys = (patient.system || "").toLowerCase();
  if (sys === "ecw")    return "ecw";
  if (sys === "athena") return "athena";
  if (sys === "epic")   return "epic";
  return "all";
}

export function routeEHRForWrite(patient: { system?: string; preferredEhr?: EhrSystem }): EhrSystem[] {
  const preferred = patient.preferredEhr || (patient.system as EhrSystem | undefined);
  if (preferred && ["ecw", "athena", "epic"].includes(preferred)) {
    return [preferred];
  }
  return ["ecw", "athena", "epic"];
}

export function isValidEhrSystem(s: string): s is EhrSystem {
  return s === "ecw" || s === "athena" || s === "epic";
}
