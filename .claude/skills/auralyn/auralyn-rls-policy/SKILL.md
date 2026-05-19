---
name: auralyn-rls-policy
description: Load when creating or modifying any table that holds PHI, encounter data, physician-scoped data, or tenant-scoped data. Triggers on phrases like "new table", "CREATE TABLE", "migration", "RLS", "row-level security", "tenant isolation", "physician scope", "PHI table", "multi-tenant".
---

# Row-Level Security Policy Pattern for Auralyn

Every table that touches PHI, encounter data, or tenant-scoped state
needs RLS before merge. This is non-negotiable for HIPAA and 510(k)
posture (see `auralyn-regulatory`).

## The three scopes

1. **Tenant-scoped** — visible only to users within a specific tenant
   (organization / clinic group). Example: `clinic_protocols`.
2. **Physician-scoped** — visible only to a specific physician within a
   tenant. Example: physician-specific RLHF deltas in
   `clinical_memory`.
3. **Global-scoped** — visible to all authenticated app roles. Example:
   `kb_master_rules`, public ingested guidelines.

## Required columns

Every new RLS-protected table must have:

```sql
tenant_id    TEXT NOT NULL,           -- always for tenant/physician scope
physician_id TEXT,                    -- only for physician scope; nullable
```

For tables with mixed scope (some rows tenant, some physician), include
a `scope` column to indicate which policy applies — or use the
`physician_id IS NULL` test for tenant-scope vs. physician-scope.

## Standard migration template

```sql
-- 1. Create the table
CREATE TABLE <table_name> (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  physician_id  TEXT,   -- nullable; non-null = physician scope
  -- ... domain columns
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes (always index by tenant_id at minimum)
CREATE INDEX idx_<table>_tenant ON <table_name> (tenant_id);
CREATE INDEX idx_<table>_physician ON <table_name> (tenant_id, physician_id)
  WHERE physician_id IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;
-- FORCE means even the table owner respects RLS; required for our setup

-- 4. Tenant policy (for tenant-scope rows)
CREATE POLICY <table>_tenant_select ON <table_name>
  FOR SELECT TO authenticated_app
  USING (
    physician_id IS NULL
    AND tenant_id = current_setting('app.tenant_id', true)
  );

CREATE POLICY <table>_tenant_modify ON <table_name>
  FOR ALL TO authenticated_app
  USING (
    physician_id IS NULL
    AND tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    physician_id IS NULL
    AND tenant_id = current_setting('app.tenant_id', true)
  );

-- 5. Physician policy (for physician-scope rows)
CREATE POLICY <table>_physician_select ON <table_name>
  FOR SELECT TO authenticated_app
  USING (
    physician_id = current_setting('app.physician_id', true)
    AND tenant_id = current_setting('app.tenant_id', true)
  );

CREATE POLICY <table>_physician_modify ON <table_name>
  FOR ALL TO authenticated_app
  USING (
    physician_id = current_setting('app.physician_id', true)
    AND tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    physician_id = current_setting('app.physician_id', true)
    AND tenant_id = current_setting('app.tenant_id', true)
  );
```

## For global-scoped tables (kb_master_rules, ingested guidelines)

No RLS, OR a permissive policy that allows all authenticated app users
to SELECT:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_global_select ON <table>
  FOR SELECT TO authenticated_app USING (true);
```

## Session variable setup (every query needs this)

```typescript
await pool.query("SET app.tenant_id = $1", [tenantId]);
await pool.query("SET app.physician_id = $1", [physicianId]);
```

## Common mistakes

- **Forgetting `FORCE ROW LEVEL SECURITY`**
- **Setting `app.tenant_id` outside a transaction** — use `SET LOCAL`
- **Forgetting `WITH CHECK`** — allows writing rows the policy won't
  allow reading
- **Storing `physician_id` without `tenant_id` constraint**

## Verification checklist

1. `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='<table>';` returns `t, t`
2. `\d <table>` shows policies listed
3. Test as physician A in tenant X — sees only their rows
4. Test as physician B in same tenant — does NOT see physician A's rows
