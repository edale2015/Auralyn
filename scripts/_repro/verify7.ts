/**
 * END-TO-END VERIFICATION — an escalated chest_pain conversation must still
 * complete ALL pipeline stages with a populated differential FOR THE PHYSICIAN.
 *
 * Runs through the REAL production handler (handleWhatsAppKBIntake — the exact
 * function the Twilio webhook calls). When the red flag fires, the patient is
 * told to go to ER (detection intact), the case goes top-of-queue for physician
 * review, and the FULL pipeline result is captured via __peekLastEscalation()
 * — proving the pipeline continued past the flag through every stage instead of
 * short-circuiting into a bare escalation stub.
 *
 * Usage: npx tsx scripts/_repro/verify7.ts
 */
import { registerTestInterceptor, clearTestInterceptor } from "../../server/whatsapp/send";
import { handleWhatsAppKBIntake, __peekLastEscalation } from "../../server/whatsapp/kbIntake";

const PHONE = "+15551230077";

const outbound: string[] = [];
registerTestInterceptor(PHONE, (msg) => outbound.push(msg));

// Quiet the chatty handler logs but keep escalation lines visible.
const realLog = console.log.bind(console);
console.log = (...a: any[]) => {
  const s = a.join(" ");
  if (/Safety escalation|Closing prior session|🚨/.test(s)) realLog("    " + s);
};

// A realistic chest-pain interview: complaint, then symptom answers. The engine
// fail-closes to ER on the first symptomatic answer — that escalation is what we
// want the pipeline to survive.
const TURNS = [
  "chest pain",
  "pressure, like squeezing",
  "it spreads to my left arm",
  "yes I am sweaty and short of breath",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < TURNS.length; i++) {
    outbound.length = 0;
    await handleWhatsAppKBIntake({ from: `whatsapp:${PHONE}`, text: TURNS[i], messageSid: `v7-${i}` });
    await sleep(700);
    realLog(`\n===== TURN ${i + 1} =====`);
    realLog(`  PATIENT >> ${TURNS[i]}`);
    for (const m of outbound) realLog(`  AURALYN << ${m.split("\n")[0]}`);
    if (__peekLastEscalation()) { realLog(`  >> red flag fired — patient sent to ER; case top-of-queue for physician`); break; }
  }

  const r = __peekLastEscalation();
  console.log = realLog;
  if (!r) { realLog("\n❌ FAIL: escalation never produced a pipeline result"); process.exit(1); }

  realLog(`\n========== PIPELINE THE PHYSICIAN RECEIVED (escalated chest_pain) ==========`);
  realLog(`  ok=${r.ok}  hardStop=${r.hardStop} (red flag DETECTED + flagged)  finalDisposition=${r.finalDisposition}`);
  realLog(`  hardStopReason: ${r.hardStopReason ?? "—"}`);
  realLog(`  totalRulesFired=${r.totalRulesFired}  criticalFlagsHit=${JSON.stringify(r.criticalFlagsHit)}`);

  realLog(`\n  --- ALL ${r.steps.length} STAGES (pipeline continued past the flag) ---`);
  for (const s of r.steps) {
    const done = s.rulesEvaluated > 0 || s.rulesFired.length > 0 || [1, 12, 13].includes(s.step);
    realLog(`   ${done ? "✓" : "·"} step ${String(s.step).padStart(2)}  ${s.name.padEnd(46)} type=${(s.ruleType ?? "—").padEnd(15)} evaluated=${String(s.rulesEvaluated).padStart(3)} fired=${s.rulesFired.length}`);
  }

  const stages1to7 = r.steps.filter(s => s.step >= 1 && s.step <= 7);
  const allFirstSeven = stages1to7.length === 7;

  const dxSteps = r.steps.filter(s => s.ruleType === "diagnosis");
  realLog(`\n  --- DIFFERENTIAL (diagnosis stages 2 & 9) ---`);
  for (const dx of dxSteps) {
    const top = (dx.rulesFired ?? []).slice(0, 8).map((x: any) => x.rule_name ?? x.rule_id);
    realLog(`   step ${dx.step} ${dx.name}: ${top.length ? top.join(" | ") : "(none)"}`);
  }
  const differentialPopulated = dxSteps.some(s => s.rulesFired.length > 0);
  const workupStep = r.steps.find(s => s.ruleType === "workup");
  const workupPopulated = (workupStep?.rulesFired.length ?? 0) > 0;

  realLog(`\n  ========== PASS CRITERIA ==========`);
  realLog(`   stages 1-7 all present : ${allFirstSeven ? "YES" : "NO"}`);
  realLog(`   red flag still detected: ${r.hardStop ? "YES" : "NO"}  (disposition=${r.finalDisposition})`);
  realLog(`   differential populated : ${differentialPopulated ? "YES" : "NO"}`);
  realLog(`   workup populated       : ${workupPopulated ? "YES" : "NO"}`);

  const pass = allFirstSeven && r.hardStop && differentialPopulated && workupPopulated;
  realLog(`\n  RESULT: ${pass ? "✅ ALL 7 STAGES COMPLETED + DIFFERENTIAL POPULATED (escalation preserved)" : "❌ FAIL"}`);
  clearTestInterceptor(PHONE);
  process.exit(pass ? 0 : 1);
})();
