import * as fs from "fs/promises";
import * as path from "path";

export type TenantPlan = "starter" | "professional" | "enterprise";
export type TenantStatus = "active" | "suspended" | "trial" | "offboarding";

export interface TenantConfig {
  maxCasesPerMonth: number;
  maxPhysicians: number;
  goldenThreshold: number;
  maxCostPerCase: number;
  retentionDays: number;
  features: string[];
  branding: {
    clinicName: string;
    primaryColor: string;
    logoUrl: string;
  };
  allowedComplaints: string[];
  channels: string[];
}

export interface Tenant {
  id: string;
  siteId: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  adminEmail: string;
  region: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
  casesThisMonth: number;
  totalCases: number;
}

const TENANTS_FILE = path.join(process.cwd(), "tenants.json");

const DEFAULT_TENANTS: Tenant[] = [
  {
    id: "ten_001",
    siteId: "site_main",
    name: "ENT Flu Slice Main Clinic",
    plan: "enterprise",
    status: "active",
    adminEmail: "admin@entfluslice.com",
    region: "us-east-1",
    config: {
      maxCasesPerMonth: 5000,
      maxPhysicians: 25,
      goldenThreshold: 0.85,
      maxCostPerCase: 0.12,
      retentionDays: 2555,
      features: ["graph_mode", "telemedicine", "outcome_tracking", "population_health", "clinical_coding", "multi_site"],
      branding: { clinicName: "ENT Flu Slice", primaryColor: "#2563eb", logoUrl: "" },
      allowedComplaints: ["cough", "sore_throat", "uti", "ear_pain", "sinus_pressure", "fever", "rash", "chest_pain", "abdominal_pain"],
      channels: ["whatsapp", "telegram", "web"],
    },
    createdAt: new Date(Date.now() - 86400000 * 180).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    casesThisMonth: 1247,
    totalCases: 18432,
  },
  {
    id: "ten_002",
    siteId: "site_urgent_care_north",
    name: "Northside Urgent Care",
    plan: "professional",
    status: "active",
    adminEmail: "ops@northsideuc.com",
    region: "us-west-2",
    config: {
      maxCasesPerMonth: 800,
      maxPhysicians: 8,
      goldenThreshold: 0.80,
      maxCostPerCase: 0.10,
      retentionDays: 1825,
      features: ["graph_mode", "outcome_tracking", "clinical_coding"],
      branding: { clinicName: "Northside Urgent Care", primaryColor: "#16a34a", logoUrl: "" },
      allowedComplaints: ["cough", "sore_throat", "uti", "fever", "ear_pain"],
      channels: ["whatsapp", "sms"],
    },
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    casesThisMonth: 312,
    totalCases: 1896,
  },
  {
    id: "ten_003",
    siteId: "site_pediatric_center",
    name: "Sunshine Pediatric Center",
    plan: "starter",
    status: "trial",
    adminEmail: "admin@sunshinepeds.com",
    region: "us-central-1",
    config: {
      maxCasesPerMonth: 200,
      maxPhysicians: 3,
      goldenThreshold: 0.75,
      maxCostPerCase: 0.08,
      retentionDays: 365,
      features: ["outcome_tracking"],
      branding: { clinicName: "Sunshine Pediatric Center", primaryColor: "#f59e0b", logoUrl: "" },
      allowedComplaints: ["cough", "fever", "ear_pain", "rash"],
      channels: ["sms"],
    },
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    casesThisMonth: 47,
    totalCases: 47,
  },
];

const ALL_FEATURES = [
  "graph_mode", "telemedicine", "outcome_tracking", "population_health",
  "clinical_coding", "multi_site", "comm_hub", "provider_analytics",
  "export_ehr", "patient_consent", "shadow_mode", "synthetic_testing",
];

async function loadTenants(): Promise<Tenant[]> {
  try {
    const raw = await fs.readFile(TENANTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return DEFAULT_TENANTS;
  }
}

async function saveTenants(tenants: Tenant[]): Promise<void> {
  await fs.writeFile(TENANTS_FILE, JSON.stringify(tenants, null, 2));
}

export async function listTenants(): Promise<Tenant[]> {
  return loadTenants();
}

export async function getTenant(id: string): Promise<Tenant | null> {
  const all = await loadTenants();
  return all.find(t => t.id === id) ?? null;
}

export async function createTenant(data: Omit<Tenant, "id" | "createdAt" | "updatedAt" | "casesThisMonth" | "totalCases">): Promise<Tenant> {
  const tenants = await loadTenants();
  const tenant: Tenant = {
    ...data,
    id: `ten_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    casesThisMonth: 0,
    totalCases: 0,
  };
  tenants.push(tenant);
  await saveTenants(tenants);
  return tenant;
}

export async function updateTenant(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
  const tenants = await loadTenants();
  const idx = tenants.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tenants[idx] = { ...tenants[idx], ...patch, updatedAt: new Date().toISOString() };
  await saveTenants(tenants);
  return tenants[idx];
}

export async function deleteTenant(id: string): Promise<boolean> {
  const tenants = await loadTenants();
  const filtered = tenants.filter(t => t.id !== id);
  if (filtered.length === tenants.length) return false;
  await saveTenants(filtered);
  return true;
}

export async function getTenantSummary() {
  const tenants = await loadTenants();
  return {
    total: tenants.length,
    active: tenants.filter(t => t.status === "active").length,
    trial: tenants.filter(t => t.status === "trial").length,
    suspended: tenants.filter(t => t.status === "suspended").length,
    byPlan: {
      starter: tenants.filter(t => t.plan === "starter").length,
      professional: tenants.filter(t => t.plan === "professional").length,
      enterprise: tenants.filter(t => t.plan === "enterprise").length,
    },
    totalCasesThisMonth: tenants.reduce((s, t) => s + t.casesThisMonth, 0),
    allFeatures: ALL_FEATURES,
  };
}

export { ALL_FEATURES };
