/**
 * writeGuard.ts — Development-time illegal write path detector
 *
 * Enforces the architectural rule that all EHR writes must flow
 * through executeClinicalWrite() in clinicalWriteOrchestrator.ts.
 *
 * In production (NODE_ENV=production) this is a no-op guard.
 * In development/test it throws hard on violations so they surface
 * during integration testing rather than silently reaching production.
 */

const ALLOWED_CALLERS = [
  "clinicalWriteOrchestrator",
  "writeEncounterRoute",
];

/**
 * Call at the top of any function that performs a direct EHR write.
 * Provide the calling module filename (typically __filename or import.meta.url).
 *
 * @example
 *   assertWriteAccess("ehrWriter");          // allowed — it IS the canonical writer
 *   assertWriteAccess("someBusinessRoute");   // throws in dev, warns in prod
 */
export function assertWriteAccess(callerModule: string): void {
  const allowed = ALLOWED_CALLERS.some((name) =>
    callerModule.toLowerCase().includes(name.toLowerCase())
  );

  if (allowed) return;

  const message =
    `ILLEGAL EHR WRITE PATH detected in module "${callerModule}". ` +
    `All clinical writes must flow through executeClinicalWrite() ` +
    `in server/ehr/clinicalWriteOrchestrator.ts`;

  if (process.env.NODE_ENV === "production") {
    // In production: log loudly but don't crash — clinical continuity first
    console.error(`[writeGuard] CRITICAL — ${message}`);
  } else {
    // In development/test: throw hard so this never ships
    throw new Error(`[writeGuard] ${message}`);
  }
}

/**
 * Register an additional module as a legitimate direct-write caller.
 * Only used for canonical infrastructure (e.g., ehrWriter itself).
 */
export function registerAllowedWriteCaller(callerModule: string): void {
  if (!ALLOWED_CALLERS.includes(callerModule)) {
    ALLOWED_CALLERS.push(callerModule);
  }
}
