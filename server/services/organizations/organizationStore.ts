export interface Organization {
  orgId: string;
  name: string;
  tier: "free" | "pro" | "enterprise";
  createdAt: string;
  settings: Record<string, unknown>;
}

const orgs = new Map<string, Organization>();
orgs.set("default_org", { orgId: "default_org", name: "Default Clinic", tier: "pro", createdAt: new Date().toISOString(), settings: {} });

export function listOrganizations(): Organization[] {
  return Array.from(orgs.values());
}

export function getOrganization(orgId: string): Organization | undefined {
  return orgs.get(orgId);
}

export function createOrganization(input: Omit<Organization, "createdAt">): Organization {
  const org = { ...input, createdAt: new Date().toISOString() };
  orgs.set(org.orgId, org);
  return org;
}
