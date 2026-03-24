import { auditLog } from "../security/auditLogger";

export interface PhysicianLicense {
  physicianId: string;
  physicianName?: string;
  states: string[];
  specialty?: string;
  licenseNumbers?: Record<string, string>;
  expiresAt?: Record<string, string>;
}

export interface StateCompliance {
  allowed: boolean;
  reason?: string;
  physicianId?: string;
  state?: string;
  licenseNumber?: string;
  expiresAt?: string;
}

export interface ExpansionSuggestion {
  state: string;
  unservedCases: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  estimatedRevenue: number;
  licensingCost: number;
  roi: number;
}

const licenses = new Map<string, PhysicianLicense>();

const US_STATE_TELEHEALTH_COMPACT: string[] = [
  "AL", "AZ", "AR", "CO", "DE", "FL", "GA", "ID", "IA", "KS", "KY",
  "LA", "ME", "MD", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "ND", "OH", "OK", "OR", "PA", "SD", "TN", "TX", "UT",
  "VT", "WA", "WV", "WI", "WY",
];

const LICENSE_COST_PER_STATE = 800;
const AVG_REVENUE_PER_CASE = 130;

const SEED_LICENSES: PhysicianLicense[] = [
  { physicianId: "dr-001", physicianName: "Dr. Chen", states: ["NY", "NJ", "CT", "PA"], specialty: "ENT" },
  { physicianId: "dr-002", physicianName: "Dr. Patel", states: ["NY", "FL", "TX", "CA"], specialty: "Internal Medicine" },
  { physicianId: "dr-003", physicianName: "Dr. Rivera", states: ["NY", "NJ"], specialty: "Dermatology" },
  { physicianId: "dr-004", physicianName: "Dr. Kim", states: ["NY", "MA", "IL"], specialty: "Cardiology" },
];

function seedLicenses(): void {
  for (const l of SEED_LICENSES) {
    licenses.set(l.physicianId, l);
  }
}

export function registerLicense(l: PhysicianLicense): PhysicianLicense {
  const existing = licenses.get(l.physicianId);
  const merged = existing
    ? { ...existing, states: [...new Set([...existing.states, ...l.states])] }
    : l;
  licenses.set(l.physicianId, merged);
  auditLog({ actor: "license_registry", action: "license_registered", details: { physicianId: l.physicianId, states: l.states } });
  return merged;
}

export function isLicensed(physicianId: string, state: string): boolean {
  const lic = licenses.get(physicianId);
  return !!lic?.states.includes(state.toUpperCase());
}

export function checkCompliance(data: { physicianId: string; state: string; complaint?: string }): StateCompliance {
  const state = data.state.toUpperCase();
  const lic = licenses.get(data.physicianId);

  if (!lic) {
    return { allowed: false, reason: "Physician not registered in license registry", physicianId: data.physicianId, state };
  }

  const licensed = lic.states.includes(state);
  if (!licensed) {
    return { allowed: false, reason: `${lic.physicianName ?? data.physicianId} is not licensed in ${state}`, physicianId: data.physicianId, state };
  }

  const licenseNumber = lic.licenseNumbers?.[state];
  const expiresAt = lic.expiresAt?.[state];

  if (expiresAt && new Date(expiresAt) < new Date()) {
    return { allowed: false, reason: `License in ${state} expired on ${expiresAt}`, physicianId: data.physicianId, state, expiresAt };
  }

  return { allowed: true, physicianId: data.physicianId, state, licenseNumber, expiresAt };
}

export function getLicenses(): PhysicianLicense[] {
  return [...licenses.values()];
}

export function getPhysicianLicense(physicianId: string): PhysicianLicense | undefined {
  return licenses.get(physicianId);
}

export function suggestLicensingExpansion(
  demandData: Array<{ state: string; unservedCases: number }>
): ExpansionSuggestion[] {
  return demandData
    .filter((d) => d.unservedCases > 10)
    .map((d) => {
      const priority: ExpansionSuggestion["priority"] =
        d.unservedCases > 200 ? "HIGH" : d.unservedCases > 50 ? "MEDIUM" : "LOW";
      const estimatedRevenue = d.unservedCases * AVG_REVENUE_PER_CASE;
      const roi = Math.round((estimatedRevenue / LICENSE_COST_PER_STATE) * 100) / 100;
      return { state: d.state.toUpperCase(), unservedCases: d.unservedCases, priority, estimatedRevenue, licensingCost: LICENSE_COST_PER_STATE, roi };
    })
    .sort((a, b) => b.unservedCases - a.unservedCases);
}

export function getTelehealthCompactStates(): string[] {
  return US_STATE_TELEHEALTH_COMPACT;
}

export function getCoverageMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const lic of licenses.values()) {
    for (const state of lic.states) {
      if (!map[state]) map[state] = [];
      map[state].push(lic.physicianId);
    }
  }
  return map;
}

seedLicenses();
