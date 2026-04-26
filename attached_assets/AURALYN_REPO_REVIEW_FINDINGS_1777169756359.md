# Auralyn repo review findings for CLAUDE.md hardening

Sanitized review zip inspected on 2026-04-26. This file intentionally avoids secret values and PHI.

## What I changed in CLAUDE.md

- Replaced the 978-line context bundle style with a 203-line operational guide.
- Made the file repo-specific, not generic: auth split, audit split, migration gap, frontend token state, route scale, testing config, secret-handling risks, and clinical invariants are now called out directly.
- Kept the Karpathy-style agent discipline: smallest diff, no assumptions, touch only required files, verify against success criteria.
- Put the highest-risk medical and security rules near the top so Claude Code sees them before routine project details.

## High-priority findings from the zip

### 1. The zip was not fully sanitized

The `.replit` file contained live-looking credential values and passwords under `[userenv.shared]`. I did not copy or expose the values here. Rotate anything that appeared there and move secrets into Replit Secrets or a managed secret store.

Examples of affected categories:

- JWT/application secrets
- demo or clinic passwords
- provider/test tokens
- Twilio identifiers
- Firebase/project identifiers
- Google Sheets identifiers
- public deployment URL

### 2. Sanitization broke TypeScript in multiple source files

The export replaced some environment-variable expressions with bare `[REDACTED]`, which is invalid TypeScript. This appeared in auth, audit, Telegram/Twilio, storage, tests, and service files. I did not run a meaningful typecheck against the sanitized export because those replacements would produce false failures.

Before running checks on a sanitized export, replace bare redaction placeholders with syntactically valid stubs such as `process.env.X` or `"[REDACTED]"`, depending on context.

### 3. Auth is fragmented

The repo has several auth paths:

- `server/security/session.ts`: cookie plus transitional Bearer fallback, CSRF middleware, WebSocket auth helper.
- `server/routes/roleAuth.ts` plus `server/services/authService.ts`: role-based token login/refresh/me.
- `server/middleware/requireRole.ts`: Bearer-only route protection using `authService`.
- `server/auth.ts` and `server/routes.auth.ts`: deprecated provider session auth.
- `client/src/context/AuthContext.tsx` and `client/src/components/RoleGuard.tsx`: still use localStorage bearer tokens.

This is why the final CLAUDE.md says not to assume cookie-only auth and not to add new localStorage token usage.

### 4. Audit writing is split

`server/audit/hashChain.ts` and `server/audit/auditLogger.ts` both write to `audit_logs`, but they use different material/genesis conventions. Many call sites still use `auditStep()` or legacy `logEvent()` patterns. The final CLAUDE.md tells Claude to use `appendAuditEvent()` for new regulated clinical events and not to mix audit writers casually.

### 5. Migration policy needed correction

`drizzle.config.ts` points output to `./migrations`, but the reviewed export did not include a root `migrations/` directory. The final CLAUDE.md now instructs Claude to create explicit SQL migrations for existing-table changes and avoid `db:push --force` on production-shaped data.

### 6. Git ignore hygiene is weaker than Docker ignore hygiene

`.dockerignore` excludes `.env*`, sqlite/WAL/SHM files, uploads, logs, and infrastructure state. `.gitignore` was much thinner and had at least one suspicious concatenated line. Strengthen `.gitignore` before committing from this repo.

Recommended additions:

```gitignore
.env
.env.*
*.log
*.sqlite
*.sqlite-shm
*.sqlite-wal
uploads/
data/
reports/
coverage/
infra/.terraform/
infra/*.tfstate
infra/*.tfstate.*
```

### 7. Legacy auth routes may have signature drift

In the reviewed export, `server/routes.auth.ts` calls `setProviderSession(res)` while `server/auth.ts` defines `setProviderSession(res, user)`. This may be a real bug or a sanitization artifact. Verify before relying on `/api/auth/login`.

### 8. Duplicate legacy login route exists

`server/routes.ts` also registers `/api/auth/login`, while `server/routes.auth.ts` registers the same path and is mounted earlier in `server/index.ts`. Avoid adding new behavior to legacy auth unless the task is explicitly to migrate or remove it.

### 9. Test configuration misses some tests

`vitest.config.ts` includes only:

- `tests/unit/**/*.test.ts`
- `tests/integration/**/*.test.ts`
- `tests/contracts/**/*.test.ts`

Root-level tests such as `tests/tenantIsolation.test.ts` and `tests/acuityPreClassifier.test.ts` may not run by default. Use explicit paths or update the config when appropriate.

### 10. Playwright is installed but not configured

The repo has Playwright as a dependency, but no `playwright.config.*` file was present in the reviewed export. Do not assume `npx playwright test` covers the app until config and test files are verified.

## Suggested first follow-up hardening tasks

1. Rotate exposed secrets and remove secret values from `.replit`.
2. Strengthen `.gitignore` to match `.dockerignore` for sensitive/generated artifacts.
3. Complete role-auth cookie migration and remove localStorage bearer token use.
4. Decide on one audit writer for regulated events and migrate legacy call sites.
5. Add/restore `migrations/` with explicit SQL migration policy.
6. Update Vitest config to include root-level safety tests or move those tests into included folders.
7. Add focused tests for physician approval gate, tenant isolation, audit verification, CSRF rejection, and PHI-scrubbed WebSockets.
