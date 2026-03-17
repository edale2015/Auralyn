export interface Subscription {
  id: string;
  tenantId: string;
  plan: "basic" | "pro" | "enterprise";
  status: "active" | "past_due" | "canceled" | "trialing";
  priceMonthly: number;
  startedAt: number;
  currentPeriodEnd: number;
  features: string[];
}

export interface Invoice {
  id: string;
  tenantId: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  issuedAt: number;
  description: string;
}

const PLAN_PRICES: Record<string, number> = {
  basic: 49,
  pro: 149,
  enterprise: 499,
};

export class BillingService {
  private subscriptions: Subscription[] = [];
  private invoices: Invoice[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    const now = Date.now();
    const month = 30 * 24 * 60 * 60 * 1000;

    this.subscriptions.push(
      { id: "sub_demo", tenantId: "demo", plan: "pro", status: "active", priceMonthly: 149, startedAt: now - month * 3, currentPeriodEnd: now + month, features: ["triage", "differential", "reasoning_replay", "analytics"] },
      { id: "sub_city", tenantId: "city_ent", plan: "enterprise", status: "active", priceMonthly: 499, startedAt: now - month * 6, currentPeriodEnd: now + month, features: ["triage", "differential", "reasoning_replay", "analytics", "auto_debug", "deployment"] },
      { id: "sub_rural", tenantId: "rural", plan: "basic", status: "active", priceMonthly: 49, startedAt: now - month, currentPeriodEnd: now + month, features: ["triage", "differential"] }
    );

    this.invoices.push(
      { id: "inv_1", tenantId: "demo", amount: 149, status: "paid", issuedAt: now - month * 2, description: "Pro Plan — Monthly" },
      { id: "inv_2", tenantId: "demo", amount: 149, status: "paid", issuedAt: now - month, description: "Pro Plan — Monthly" },
      { id: "inv_3", tenantId: "city_ent", amount: 499, status: "paid", issuedAt: now - month, description: "Enterprise Plan — Monthly" },
      { id: "inv_4", tenantId: "rural", amount: 49, status: "pending", issuedAt: now, description: "Basic Plan — Monthly" }
    );
  }

  createSubscription(tenantId: string, plan: "basic" | "pro" | "enterprise"): Subscription {
    const sub: Subscription = {
      id: `sub_${Date.now()}`,
      tenantId,
      plan,
      status: "active",
      priceMonthly: PLAN_PRICES[plan],
      startedAt: Date.now(),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      features: [],
    };
    this.subscriptions.push(sub);
    return sub;
  }

  getSubscription(tenantId: string): Subscription | undefined {
    return this.subscriptions.find((s) => s.tenantId === tenantId && s.status === "active");
  }

  getInvoices(tenantId?: string): Invoice[] {
    if (tenantId) return this.invoices.filter((i) => i.tenantId === tenantId);
    return this.invoices;
  }

  checkAccess(tenantId: string): { allowed: boolean; maxCases: number; plan: string } {
    const sub = this.getSubscription(tenantId);
    if (!sub || sub.status !== "active") return { allowed: false, maxCases: 0, plan: "none" };
    const limits: Record<string, number> = { basic: 100, pro: 1000, enterprise: 10000 };
    return { allowed: true, maxCases: limits[sub.plan] || 100, plan: sub.plan };
  }

  getRevenueSummary() {
    const mrr = this.subscriptions.filter((s) => s.status === "active").reduce((s, sub) => s + sub.priceMonthly, 0);
    return {
      mrr,
      arr: mrr * 12,
      totalSubscriptions: this.subscriptions.length,
      activeSubscriptions: this.subscriptions.filter((s) => s.status === "active").length,
      totalInvoices: this.invoices.length,
      paidInvoices: this.invoices.filter((i) => i.status === "paid").length,
      pendingInvoices: this.invoices.filter((i) => i.status === "pending").length,
      revenue: this.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0),
    };
  }

  getPlans() {
    return [
      { name: "Basic", price: 49, maxCases: 100, features: ["Symptom Intake", "Triage + Differential", "Physician Review Screen"] },
      { name: "Pro", price: 149, maxCases: 1000, features: ["Everything in Basic", "Reasoning Replay", "Question Optimization", "Safety Scoring", "Clinical Analytics"] },
      { name: "Enterprise", price: 499, maxCases: 10000, features: ["Everything in Pro", "Auto-Debugging", "Autonomous Deployment", "Federated Learning", "Custom Protocols", "Dedicated Support"] },
    ];
  }
}

export const billingService = new BillingService();
