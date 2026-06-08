/**
 * Multi-turn chest-pain simulation through the REAL production handler
 * (server/whatsapp/kbIntake.ts -> handleWhatsAppKBIntake), the same function
 * the Twilio webhook calls in production. Outbound Twilio sends are intercepted
 * (registerTestInterceptor) so we capture verbatim replies without hitting Twilio.
 *
 * Usage: npx tsx scripts/_repro/sim.ts <scenario>
 *   scenario = "repro"  -> patient naturally re-mentions "chest pain"
 *   scenario = "clean"  -> patient never re-mentions the complaint phrase
 */
import { registerTestInterceptor, clearTestInterceptor } from "../../server/whatsapp/send";
import { handleWhatsAppKBIntake } from "../../server/whatsapp/kbIntake";

const PHONE = "+15551230007";          // single fixed WhatsApp user across all turns
const E164  = PHONE;                    // interceptor key is normalized E.164

const buffer: string[] = [];
registerTestInterceptor(E164, (msg) => buffer.push(msg));

const scenarios: Record<string, string[]> = {
  // Patient re-mentions "chest pain" in natural answers (very common phrasing)
  repro: [
    "chest pain",
    "the chest pain is squeezing",          // re-mentions "chest pain"
    "about an hour ago",
    "it spreads to my left arm",
    "yes",
  ],
  // Patient answers without ever repeating the complaint phrase
  clean: [
    "chest pain",
    "sudden, came on while resting",
    "yes it goes into my left arm and jaw",
    "yes I am sweating and clammy",
    "yes I am short of breath",
    "no I have not fainted",
    "I am 58",
  ],
};

const flush = () => {
  for (const m of buffer) {
    console.log("   AURALYN << " + m.replace(/\n/g, "\n              "));
  }
  buffer.length = 0;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const which = process.argv[2] ?? "repro";
  const turns = scenarios[which] ?? scenarios.repro;
  console.log(`\n================ SCENARIO: ${which} (phone ${PHONE}) ================\n`);
  for (let i = 0; i < turns.length; i++) {
    const text = turns[i];
    console.log(`----- TURN ${i + 1} -----`);
    console.log("   PATIENT >> " + text);
    await handleWhatsAppKBIntake({ from: `whatsapp:${PHONE}`, text, messageSid: `sim-${which}-${i}` });
    await sleep(600);   // let awaited sends land
    flush();
    console.log("");
  }
  // final wait for the delayed CSAT survey (setTimeout 2000ms) if triage completed
  await sleep(2500);
  flush();
  clearTestInterceptor(E164);
  console.log("================ END SCENARIO ================\n");
  process.exit(0);
})();
