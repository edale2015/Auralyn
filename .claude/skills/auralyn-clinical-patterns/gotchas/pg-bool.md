# Gotcha: pgBool() — PostgreSQL boolean columns return strings via raw SQL

## The Problem

When using `db.execute(sql\`...\`)` (Drizzle raw SQL), PostgreSQL boolean columns
return `"t"` or `"f"` strings, NOT JavaScript `true`/`false`.

This means strict equality checks silently drop rows:

```typescript
// ❌ WRONG — row.cannot_miss is "t", not true — filter drops all must-not-miss rows
const mustNotMiss = rows.filter(r => r.cannot_miss === true);

// ❌ WRONG — "f" is truthy in JS, so non-first-line meds get marked as ★
const star = row.is_first_line ? " ★" : "";
```

## The Fix — use pgBool()

Define once at the top of any file that runs raw SQL queries:

```typescript
// PostgreSQL booleans arrive as "t"/"f" strings via raw db.execute() — not JS true/false
function pgBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (val === "t" || val === "true"  || val === 1) return true;
  if (val === "f" || val === "false" || val === 0) return false;
  return false;
}
```

Then use it everywhere:

```typescript
// ✅ CORRECT
const mustNotMiss = rows.filter(r => pgBool(r.cannot_miss));
const isFirstLine = pgBool(row.is_first_line);
const isActive    = pgBool(row.active);
```

## When Does This Happen?

- `db.execute(sql\`SELECT ...\`)` — Drizzle raw SQL, always returns strings for booleans
- `db.execute(sql\`...\`).then(r => r.rows)` — same

## When Does It NOT Happen?

- Drizzle ORM queries via `db.select().from(table)` — Drizzle maps booleans correctly
- Only raw `db.execute()` has this issue

## Affected Columns in Auralyn KB

| Table | Column |
|---|---|
| `kb_red_flag_rules` | `active` |
| `kb_diagnosis_rules` | `cannot_miss`, `active` |
| `kb_treatment_rules` | `is_first_line`, `active` |
| `kb_disposition_rules` | `active` |
| `kb_modifiers` | `active` |
| `kb_master_rules` | `active` |

## Where pgBool() is Already Defined

`server/retrieval/kbQueryLayer.ts` — copy from there if needed.
