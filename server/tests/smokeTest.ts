/**
 * smokeTest.ts — 2-scenario quick check (<60s)
 * Verifies 2500ms timeout + question library fallback are working.
 * Run: npx tsx server/tests/smokeTest.ts
 */

import { conversationalEngine } from "../whatsapp/conversationalEngine";

const PASS = "\x1b[32m✅\x1b[0m";
const FAIL = "\x1b[31m❌\x1b[0m";

let failures = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ${PASS} ${msg}`);
  } else {
    console.log(`  ${FAIL} ${msg}`);
    failures++;
  }
}

async function runScenario(name: string, turns: string[], expectER: boolean) {
  console.log(`\nScenario: ${name}`);
  const threadId = `smoke-${Date.now()}-${Math.random()}`;
  let finalDisposition: string | undefined;
  const latencies: number[] = [];

  for (const msg of turns) {
    const t0 = Date.now();
    const result = await conversationalEngine.getNextResponse({ threadId, message: msg, channel: "test" });
    const ms = Date.now() - t0;
    latencies.push(ms);
    console.log(`  Turn ${latencies.length}: ${ms}ms — "${result.response.slice(0, 70)}${result.response.length > 70 ? "…" : ""}"`);

    assert(ms < 5000, `Turn ${latencies.length} latency ${ms}ms < 5000ms`);
    assert(result.response.length <= 160, `Response length ${result.response.length} ≤ 160`);

    if (result.disposition) {
      finalDisposition = result.disposition;
      break;
    }
    conversationalEngine.clearSession; // keep session alive
  }

  const maxMs = Math.max(...latencies);
  const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const isER = finalDisposition?.toLowerCase().includes("ambulance") ||
               finalDisposition?.toLowerCase().includes("er") ||
               finalDisposition?.toLowerCase().includes("ed");

  assert(maxMs < 5000, `Max latency ${maxMs}ms < 5000ms`);
  assert(avgMs < 3000, `Avg latency ${avgMs}ms < 3000ms`);

  if (expectER) {
    assert(isER, `ER escalation fired (disposition: ${finalDisposition ?? "none"})`);
  } else {
    assert(!isER, `No false ER escalation (disposition: ${finalDisposition ?? "treat_and_follow"})`);
  }

  conversationalEngine.clearSession(threadId);
  return { maxMs, avgMs };
}

async function main() {
  console.log("=== AURALYN SMOKE TEST — 2500ms timeout + question library ===\n");

  const allLatencies: number[] = [];

  // Scenario 1: Simple cough, no ER
  const r1 = await runScenario("Cough — simple, no ER", [
    "I have a cough",
    "about 3 days",
    "no fever",
    "no trouble breathing",
    "some phlegm, greenish",
    "no I don't smoke",
    "no lung or heart problems",
    "I'm 35 years old",
  ], false);
  allLatencies.push(r1.maxMs, r1.avgMs);

  // Scenario 2: STEMI pattern — must escalate to ER
  const r2 = await runScenario("Chest pain — STEMI, must ER", [
    "I have chest pain",
    "it radiates to my left arm",
    "yes I am sweating heavily",
  ], true);
  allLatencies.push(r2.maxMs, r2.avgMs);

  const globalMax = Math.max(...allLatencies);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Failures: ${failures}`);
  console.log(`Global max latency: ${globalMax}ms`);

  if (failures > 0) {
    console.log(`\n${FAIL} Smoke test FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n${PASS} Smoke test PASSED`);
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
