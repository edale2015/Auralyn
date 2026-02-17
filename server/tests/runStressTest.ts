import scenarios from "./stressScenarios.json";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const CLINICIAN_PASSWORD = process.env.CLINICIAN_PASSWORD || "";

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: CLINICIAN_PASSWORD }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  if (!cookie) throw new Error("Login failed — no session cookie");
  return cookie.split(";")[0];
}

async function main() {
  console.log(`[StressTest] Running ${scenarios.length} scenarios against ${BASE_URL}`);
  const cookie = await login();
  console.log(`[StressTest] Authenticated successfully`);

  const res = await fetch(`${BASE_URL}/api/admin/stress-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ scenarios }),
  });

  if (!res.ok) {
    console.error(`[StressTest] HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`\n[StressTest] === RESULTS ===`);
  console.log(`Total: ${result.totalScenarios}`);
  console.log(`Passed: ${result.passed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Elapsed: ${result.elapsedMs}ms (avg ${result.avgMs}ms/scenario)`);

  if (result.failed > 0) {
    console.log(`\n[StressTest] === FAILURES ===`);
    for (const r of result.results) {
      if (!r.pass) {
        console.log(`\n  #${r.id} ${r.label}`);
        if (r.error) {
          console.log(`    ERROR: ${r.error}`);
        } else if (r.assertions) {
          for (const [key, val] of Object.entries(r.assertions) as any) {
            if (!val.pass) {
              console.log(`    FAIL ${key}: expected=${JSON.stringify(val.expected)} actual=${JSON.stringify(val.actual)}`);
            }
          }
        }
      }
    }
  }

  console.log(`\n[StressTest] Pass rate: ${((result.passed / result.totalScenarios) * 100).toFixed(1)}%`);
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[StressTest] Fatal:", err);
  process.exit(1);
});
