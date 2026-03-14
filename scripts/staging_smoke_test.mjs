#!/usr/bin/env node
/**
 * staging_smoke_test.mjs
 * Run: node scripts/staging_smoke_test.mjs
 *
 * Hits critical endpoints and reports pass/fail.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000"

const CHECKS = [
  { name: "Health endpoint", path: "/api/health" },
  { name: "Production readiness", path: "/api/production-readiness" },
  { name: "Acceptance analytics", path: "/api/acceptance-analytics/summary" },
  { name: "SLA analytics", path: "/api/sla-analytics/summary" },
  { name: "Canned messages", path: "/api/telemed/canned-messages" },
  { name: "Conversations list", path: "/api/conversations" },
  { name: "EHR dead letter stats", path: "/api/ehr-dead-letter/stats" },
  { name: "Reminder stats", path: "/api/reminders/stats" },
  { name: "Multilingual templates", path: "/api/multilingual-templates" },
  { name: "Template ranking v2", path: "/api/template-ranking/v2" },
  { name: "Translation provider config", path: "/api/translation-provider/config" },
  { name: "Multilingual library", path: "/api/multilingual-library" },
  { name: "Recommendation analytics", path: "/api/recommendation-analytics/summary" },
  { name: "Latest staging validation", path: "/api/staging-validation/latest" },
]

async function run() {
  console.log(`\n🔍 Staging Smoke Test — ${BASE_URL}\n`)

  let passed = 0
  let failed = 0

  for (const check of CHECKS) {
    const t0 = Date.now()
    try {
      const res = await fetch(`${BASE_URL}${check.path}`)
      const ms = Date.now() - t0
      if (res.ok) {
        console.log(`  ✅ ${check.name.padEnd(40)} ${res.status} (${ms}ms)`)
        passed++
      } else {
        console.log(`  ❌ ${check.name.padEnd(40)} ${res.status} (${ms}ms)`)
        failed++
      }
    } catch (err) {
      console.log(`  ❌ ${check.name.padEnd(40)} ERROR: ${err.message}`)
      failed++
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${CHECKS.length} checks`)

  if (failed > 0) {
    console.log("❌ Staging smoke test FAILED")
    process.exit(1)
  } else {
    console.log("✅ Staging smoke test PASSED")
    process.exit(0)
  }
}

run()
