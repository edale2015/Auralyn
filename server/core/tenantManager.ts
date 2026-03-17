export interface Tenant {
  id: string;
  name: string;
  plan: "basic" | "pro" | "enterprise";
  createdAt: number;
  status: "active" | "suspended" | "trial";
  maxCases: number;
  casesUsed: number;
  contactEmail: string;
  features: string[];
}

const PLAN_LIMITS: Record<string, { maxCases: number; features: string[] }> = {
  basic: { maxCases: 100, features: ["triage", "differential", "physician_review"] },
  pro: { maxCases: 1000, features: ["triage", "differential", "physician_review", "reasoning_replay", "question_optimization", "safety_scoring", "analytics"] },
  enterprise: { maxCases: 10000, features: ["triage", "differential", "physician_review", "reasoning_replay", "question_optimization", "safety_scoring", "analytics", "auto_debug", "deployment", "federated_learning", "custom_protocols"] },
};

export class TenantManager {
  private tenants: Record<string, Tenant> = {};

  constructor() {
    this.seed();
  }

  private seed() {
    this.create("Auralyn Demo Clinic", "demo@auralyn.ai", "pro");
    this.create("City ENT Center", "admin@cityent.com", "enterprise");
    this.create("Rural Health Station", "intake@ruralhealth.org", "basic");
  }

  create(name: string, contactEmail: string, plan: Tenant["plan"] = "basic"): Tenant {
    const id = "tenant_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const limits = PLAN_LIMITS[plan];
    const tenant: Tenant = {
      id, name, plan, contactEmail,
      createdAt: Date.now(),
      status: "active",
      maxCases: limits.maxCases,
      casesUsed: Math.floor(Math.random() * 30),
      features: limits.features,
    };
    this.tenants[id] = tenant;
    return tenant;
  }

  get(id: string): Tenant | undefined {
    return this.tenants[id];
  }

  getAll(): Tenant[] {
    return Object.values(this.tenants);
  }

  updatePlan(id: string, plan: Tenant["plan"]): Tenant | null {
    const tenant = this.tenants[id];
    if (!tenant) return null;
    const limits = PLAN_LIMITS[plan];
    tenant.plan = plan;
    tenant.maxCases = limits.maxCases;
    tenant.features = limits.features;
    return tenant;
  }

  incrementCases(id: string): boolean {
    const tenant = this.tenants[id];
    if (!tenant) return false;
    if (tenant.casesUsed >= tenant.maxCases) return false;
    tenant.casesUsed++;
    return true;
  }

  checkAccess(id: string, feature: string): { allowed: boolean; reason?: string } {
    const tenant = this.tenants[id];
    if (!tenant) return { allowed: false, reason: "Tenant not found" };
    if (tenant.status !== "active") return { allowed: false, reason: "Tenant suspended" };
    if (!tenant.features.includes(feature)) return { allowed: false, reason: `Feature "${feature}" not available on ${tenant.plan} plan` };
    return { allowed: true };
  }

  getSummary() {
    const all = Object.values(this.tenants);
    return {
      totalTenants: all.length,
      byPlan: {
        basic: all.filter((t) => t.plan === "basic").length,
        pro: all.filter((t) => t.plan === "pro").length,
        enterprise: all.filter((t) => t.plan === "enterprise").length,
      },
      byStatus: {
        active: all.filter((t) => t.status === "active").length,
        suspended: all.filter((t) => t.status === "suspended").length,
        trial: all.filter((t) => t.status === "trial").length,
      },
      totalCases: all.reduce((s, t) => s + t.casesUsed, 0),
    };
  }
}

export const tenantManager = new TenantManager();
