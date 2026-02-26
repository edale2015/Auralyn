import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: npx tsx scripts/new_complaint_kit.ts <cc_id> <system> <label>");
  console.error("Example: npx tsx scripts/new_complaint_kit.ts back_pain MSK \"Back Pain\"");
  process.exit(1);
}

const ccId = args[0].toLowerCase().replace(/[\s-]+/g, "_");
const system = args[1].toUpperCase();
const label = args[2];
const prefix = ccId.split("_").map(w => w[0]?.toUpperCase() || "").join("");

const CSV_DIR = path.resolve(__dirname, "../server/data/csv");
const TEST_DIR = path.resolve(__dirname, "../tests/cases", ccId);

function appendCsv(filename: string, rows: string[]): void {
  const filePath = path.join(CSV_DIR, filename);
  const existing = fs.readFileSync(filePath, "utf-8");
  const needsNewline = !existing.endsWith("\n");
  const content = (needsNewline ? "\n" : "") + rows.join("\n") + "\n";
  fs.appendFileSync(filePath, content);
  console.log(`  ✓ Appended ${rows.length} row(s) to ${filename}`);
}

console.log(`\nScaffolding new complaint: ${ccId} (${system} / ${label})\n`);

appendCsv("COMPLAINT_REGISTRY.csv", [
  `${ccId},${system},${label},1,${system}_DEFAULT,GENERIC_V1_SCORE,${prefix}_GRAPH_V1,TRUE,${ccId},GENERIC_V1`,
]);

const qIds = [
  `Q_${prefix}_SYMPTOM_1`,
  `Q_${prefix}_SYMPTOM_2`,
  `Q_${prefix}_SYMPTOM_3`,
  `Q_${prefix}_FEVER`,
  `Q_${prefix}_DURATION`,
];
const questionRows = qIds.map((qId, i) => {
  const order = (i + 1) * 10;
  return `${ccId},1,${qId},${order},Do you have ${qId.replace(/Q_[A-Z]+_/, "").toLowerCase().replace(/_/g, " ")}?,true,true,text,true`;
});
appendCsv("CORE_QUESTIONS.csv", questionRows);

const rfIds = [`RF_${prefix}_DANGER_01`, `RF_${prefix}_DANGER_02`];
appendCsv("RED_FLAG_RULES.csv", [
  `${ccId},${rfIds[0]},Danger sign 1,HARD,ER_SEND,answers.${qIds[0]} == 'yes' && answers.${qIds[3]} == 'yes',Immediate evaluation needed,Call 911;Go to ER,${rfIds[0]}`,
  `${ccId},${rfIds[1]},Danger sign 2,SOFT,ESCALATE,answers.${qIds[1]} == 'yes' && answers.${qIds[3]} == 'yes',Urgent evaluation,See doctor today,${rfIds[1]}`,
]);

const clusters = [
  `CL_${system}_TYPE_A`,
  `CL_${system}_TYPE_B`,
  `CL_${system}_BENIGN`,
];
const csrRows: string[] = [];
qIds.forEach((qId, qi) => {
  clusters.forEach((cl, ci) => {
    const pts = ci === qi % clusters.length ? 3 : 1;
    const ruleId = `CSR_${prefix}_${String(ci + 1).padStart(2, "0")}_${String(qi + 1).padStart(2, "0")}`;
    csrRows.push(`${ccId},${cl},${ruleId},${pts},answers.${qId} == 'yes',${qId} present`);
  });
});
appendCsv("CLUSTER_SCORING_RULES.csv", csrRows);

appendCsv("DISPOSITION_RULES.csv", [
  `${ccId},DISP_${prefix}_ER,1,redFlagGate.gateResult == 'ER_SEND',er_send,TPL_${prefix}_ER,HIGH`,
  `${ccId},DISP_${prefix}_UC,2,scores.${clusters[0].replace(/^CL_/, "").toLowerCase()}_score >= 6,urgent_care,TPL_${prefix}_UC,MODERATE`,
  `${ccId},DISP_${prefix}_PCP,3,scores.${clusters[1].replace(/^CL_/, "").toLowerCase()}_score >= 4,pcp,TPL_${prefix}_PCP,MODERATE`,
  `${ccId},DISP_${prefix}_ROUTINE,99,true,routine,TPL_${prefix}_ROUTINE,LOW`,
]);

appendCsv("OUTPUT_TEMPLATES.csv", [
  `${ccId},TPL_${prefix}_ER,ER Referral,web,Go to the emergency room immediately. {{red_flag_labels}}`,
  `${ccId},TPL_${prefix}_UC,Urgent Care,web,Please visit urgent care within 24 hours for evaluation.`,
  `${ccId},TPL_${prefix}_PCP,PCP Visit,web,Schedule a visit with your primary care provider.`,
  `${ccId},TPL_${prefix}_ROUTINE,Routine,web,Monitor your symptoms and follow up as needed.`,
]);

if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

for (let i = 1; i <= 10; i++) {
  const id = `G${String(i).padStart(2, "0")}`;
  const testCase = {
    id,
    label: `${label} scenario ${i}`,
    cc_id: ccId,
    answers: Object.fromEntries(qIds.map(q => [q, i <= 2 ? "yes" : "no"])),
    expect: {
      disposition: i <= 2 ? "er_send" : "routine",
      cluster: clusters[0],
      rf_must_fire: i <= 2 ? [rfIds[0]] : [],
      rf_gate: i <= 2 ? "ER_SEND" : "PASS",
    },
  };
  const filePath = path.join(TEST_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(testCase, null, 2) + "\n");
}
console.log(`  ✓ Created ${TEST_DIR}/ with 10 golden test stubs`);

console.log(`
Done! Next steps:
  1. Edit CLUSTER_SCORING_RULES.csv with real clinical scoring rules
  2. Edit CORE_QUESTIONS.csv with real questions
  3. Edit RED_FLAG_RULES.csv with real red flags
  4. Edit DISPOSITION_RULES.csv with real thresholds
  5. Update golden tests in tests/cases/${ccId}/ to match expected outputs
  6. Run: npx tsx scripts/run_harness.ts tests/cases/${ccId}
`);
