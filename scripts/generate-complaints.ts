import fs from "fs";
import path from "path";

const CSV_DIR = path.resolve("server/data/csv");
const TEST_DIR = path.resolve("tests/cases");

interface SeedRow {
  CC_ID: string;
  SYSTEM: string;
  LABEL: string;
  ALIASES: string;
  DEFAULT_CLUSTER: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCsv(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

function appendCsv(filename: string, rows: string[]): void {
  const filePath = path.join(CSV_DIR, filename);
  const existing = fs.readFileSync(filePath, "utf-8");
  const needsNewline = !existing.endsWith("\n");
  const content = (needsNewline ? "\n" : "") + rows.join("\n") + "\n";
  fs.appendFileSync(filePath, content);
}

function getExistingCcIds(): Set<string> {
  const regPath = path.join(CSV_DIR, "COMPLAINT_REGISTRY.csv");
  const rows = parseCsv(regPath);
  return new Set(rows.map(r => r.CC_ID).filter(Boolean));
}

function prefix(ccId: string): string {
  return ccId.split("_").map(w => w[0]?.toUpperCase() || "").join("");
}

function generateOne(seed: SeedRow): { ccId: string; registryRow: string; questionsRows: string[]; rfRows: string[]; csrRows: string[]; dispRows: string[]; otRows: string[]; dxRows: string[] } {
  const ccId = seed.CC_ID;
  const sys = seed.SYSTEM;
  const label = seed.LABEL;
  const aliases = seed.ALIASES || ccId;
  const pfx = prefix(ccId);

  const qIds = [
    `Q_${pfx}_DUR`,
    `Q_${pfx}_FEVER`,
    `Q_${pfx}_PAIN`,
    `Q_${pfx}_SOB`,
    `Q_${pfx}_SEVERITY`,
  ];

  const clusters = [
    `CL_${pfx}_PRIMARY`,
    `CL_${pfx}_SECONDARY`,
    `CL_${pfx}_BENIGN`,
  ];

  const registryRow = `${ccId},${sys},${label},1,${clusters[0]},GENERIC_V1_SCORE,${pfx}_GRAPH_V1,TRUE,${aliases},GENERIC_V1`;

  const questionsRows = [
    `${ccId},1,${qIds[0]},10,How many days have you had ${label.toLowerCase()}?,number,TRUE,true,triage`,
    `${ccId},1,${qIds[1]},20,Do you have a fever?,tri,TRUE,true,triage`,
    `${ccId},1,${qIds[2]},30,Are you having significant pain?,tri,TRUE,true,cluster`,
    `${ccId},1,${qIds[3]},40,Any shortness of breath?,tri,TRUE,true,cluster`,
    `${ccId},1,${qIds[4]},50,How severe are your symptoms? (1-10),number,TRUE,true,cluster`,
  ];

  const rfRows = [
    `${ccId},RF_${pfx}_SOB,Shortness of breath,answers.${qIds[3]} == 'yes',HARD,ER_SEND,Call 911;Go to ER,Respiratory distress requires immediate evaluation`,
    `${ccId},RF_${pfx}_FEVER_PAIN,Fever with severe pain,answers.${qIds[1]} == 'yes' && answers.${qIds[2]} == 'yes',SOFT,ESCALATE,See doctor today,Fever with pain requires urgent evaluation`,
  ];

  const csrRows: string[] = [];
  csrRows.push(`${ccId},${clusters[0]},CSR_${pfx}_01,3,answers.${qIds[2]} == 'yes',Pain present`);
  csrRows.push(`${ccId},${clusters[0]},CSR_${pfx}_02,2,answers.${qIds[1]} == 'yes',Fever present`);
  csrRows.push(`${ccId},${clusters[0]},CSR_${pfx}_03,2,answers.${qIds[3]} == 'yes',SOB present`);
  csrRows.push(`${ccId},${clusters[1]},CSR_${pfx}_04,2,answers.${qIds[2]} == 'yes',Pain present`);
  csrRows.push(`${ccId},${clusters[1]},CSR_${pfx}_05,1,answers.${qIds[1]} == 'yes',Fever present`);
  csrRows.push(`${ccId},${clusters[2]},CSR_${pfx}_06,3,answers.${qIds[2]} != 'yes' && answers.${qIds[1]} != 'yes',No pain or fever`);
  csrRows.push(`${ccId},${clusters[2]},CSR_${pfx}_07,1,true,Baseline`);

  const dispRows = [
    `${ccId},DISP_${pfx}_ER,1,redFlagGate.gateResult == 'ER_SEND',er_send,TPL_${pfx}_ER,HIGH`,
    `${ccId},DISP_${pfx}_UC,2,redFlagGate.gateResult == 'ESCALATE',urgent_care,TPL_${pfx}_UC,MODERATE`,
    `${ccId},DISP_${pfx}_PCP,3,scores.${clusters[0]} >= 5,pcp,TPL_${pfx}_PCP,MODERATE`,
    `${ccId},DISP_${pfx}_ROUTINE,99,true,self_care,TPL_${pfx}_ROUTINE,LOW`,
  ];

  const otRows = [
    `${ccId},TPL_${pfx}_ER,ER Referral,all,Go to the emergency room immediately. {{red_flag_labels}}`,
    `${ccId},TPL_${pfx}_UC,Urgent Care,all,Please visit urgent care within 24 hours for evaluation of ${label.toLowerCase()}.`,
    `${ccId},TPL_${pfx}_PCP,PCP Visit,all,Schedule a visit with your primary care provider for ${label.toLowerCase()}.`,
    `${ccId},TPL_${pfx}_ROUTINE,Self Care,all,Monitor your ${label.toLowerCase()} symptoms and follow up as needed.`,
  ];

  const dxRows = [
    `${ccId},${clusters[0]},1`,
    `${ccId},${clusters[1]},2`,
    `${ccId},${clusters[2]},3`,
  ];

  return { ccId, registryRow, questionsRows, rfRows, csrRows, dispRows, otRows, dxRows };
}

function generateGoldenTests(ccId: string, label: string, pfx: string): void {
  const dir = path.join(TEST_DIR, ccId);
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });

  const qIds = [
    `Q_${pfx}_DUR`,
    `Q_${pfx}_FEVER`,
    `Q_${pfx}_PAIN`,
    `Q_${pfx}_SOB`,
    `Q_${pfx}_SEVERITY`,
  ];

  const scenarios = [
    { id: "G01", label: `${label} ER - SOB red flag`, answers: { [qIds[0]]: 2, [qIds[1]]: "yes", [qIds[2]]: "yes", [qIds[3]]: "yes", [qIds[4]]: 8 }, expect: { disposition: "er_send", rf_gate: "ER_SEND", rf_must_fire: [`RF_${pfx}_SOB`] } },
    { id: "G02", label: `${label} ER - SOB only`, answers: { [qIds[0]]: 1, [qIds[1]]: "no", [qIds[2]]: "no", [qIds[3]]: "yes", [qIds[4]]: 5 }, expect: { disposition: "er_send", rf_gate: "ER_SEND", rf_must_fire: [`RF_${pfx}_SOB`], cluster: `CL_${pfx}_BENIGN` } },
    { id: "G03", label: `${label} UC - fever+pain`, answers: { [qIds[0]]: 3, [qIds[1]]: "yes", [qIds[2]]: "yes", [qIds[3]]: "no", [qIds[4]]: 7 }, expect: { disposition: "urgent_care", rf_gate: "ESCALATE", rf_must_fire: [`RF_${pfx}_FEVER_PAIN`] } },
    { id: "G04", label: `${label} PCP - pain+fever moderate`, answers: { [qIds[0]]: 5, [qIds[1]]: "yes", [qIds[2]]: "yes", [qIds[3]]: "no", [qIds[4]]: 5 }, expect: { disposition: "urgent_care", rf_gate: "ESCALATE", rf_must_fire: [`RF_${pfx}_FEVER_PAIN`] } },
    { id: "G05", label: `${label} routine - pain only`, answers: { [qIds[0]]: 4, [qIds[1]]: "no", [qIds[2]]: "yes", [qIds[3]]: "no", [qIds[4]]: 6 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_PRIMARY` } },
    { id: "G06", label: `${label} routine - fever only`, answers: { [qIds[0]]: 3, [qIds[1]]: "yes", [qIds[2]]: "no", [qIds[3]]: "no", [qIds[4]]: 5 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_PRIMARY` } },
    { id: "G07", label: `${label} routine - mild`, answers: { [qIds[0]]: 2, [qIds[1]]: "no", [qIds[2]]: "no", [qIds[3]]: "no", [qIds[4]]: 3 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_BENIGN` } },
    { id: "G08", label: `${label} routine - very mild`, answers: { [qIds[0]]: 1, [qIds[1]]: "no", [qIds[2]]: "no", [qIds[3]]: "no", [qIds[4]]: 2 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_BENIGN` } },
    { id: "G09", label: `${label} routine - long duration`, answers: { [qIds[0]]: 14, [qIds[1]]: "no", [qIds[2]]: "no", [qIds[3]]: "no", [qIds[4]]: 4 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_BENIGN` } },
    { id: "G10", label: `${label} routine - minimal`, answers: { [qIds[0]]: 7, [qIds[1]]: "no", [qIds[2]]: "no", [qIds[3]]: "no", [qIds[4]]: 1 }, expect: { disposition: "self_care", rf_gate: "PASS", rf_must_fire: [], cluster: `CL_${pfx}_BENIGN` } },
  ];

  for (const s of scenarios) {
    const testCase = {
      id: s.id,
      label: s.label,
      cc_id: ccId,
      answers: s.answers,
      expect: {
        disposition: s.expect.disposition,
        cluster: (s.expect as any).cluster || `CL_${pfx}_PRIMARY`,
        rf_must_fire: s.expect.rf_must_fire,
        rf_gate: s.expect.rf_gate,
      },
    };
    fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(testCase, null, 2) + "\n");
  }
}

function main() {
  const seedPath = process.argv[2];

  if (seedPath && fs.existsSync(seedPath)) {
    console.log(`\nBulk mode: reading seed CSV from ${seedPath}\n`);
    const seedRows = parseCsv(seedPath);
    const existingIds = getExistingCcIds();
    let added = 0;
    let skipped = 0;

    const allRegistry: string[] = [];
    const allQuestions: string[] = [];
    const allRf: string[] = [];
    const allCsr: string[] = [];
    const allDisp: string[] = [];
    const allOt: string[] = [];
    const allDx: string[] = [];

    for (const row of seedRows) {
      const ccId = (row.CC_ID || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (!ccId) continue;

      if (existingIds.has(ccId)) {
        console.log(`  SKIP ${ccId} (already in registry)`);
        skipped++;
        continue;
      }

      const seed: SeedRow = {
        CC_ID: ccId,
        SYSTEM: (row.SYSTEM || "GENERAL").toUpperCase(),
        LABEL: row.LABEL || row.DISPLAY_NAME || ccId,
        ALIASES: row.ALIASES || ccId,
        DEFAULT_CLUSTER: row.DEFAULT_CLUSTER || "",
      };

      const gen = generateOne(seed);
      allRegistry.push(gen.registryRow);
      allQuestions.push(...gen.questionsRows);
      allRf.push(...gen.rfRows);
      allCsr.push(...gen.csrRows);
      allDisp.push(...gen.dispRows);
      allOt.push(...gen.otRows);
      allDx.push(...gen.dxRows);

      const pfx = prefix(ccId);
      generateGoldenTests(ccId, seed.LABEL, pfx);

      console.log(`  ADD  ${ccId} (${seed.SYSTEM} / ${seed.LABEL})`);
      added++;
    }

    if (allRegistry.length > 0) {
      appendCsv("COMPLAINT_REGISTRY.csv", allRegistry);
      appendCsv("CORE_QUESTIONS.csv", allQuestions);
      appendCsv("RED_FLAG_RULES.csv", allRf);
      appendCsv("CLUSTER_SCORING_RULES.csv", allCsr);
      appendCsv("DISPOSITION_RULES.csv", allDisp);
      appendCsv("OUTPUT_TEMPLATES.csv", allOt);
      appendCsv("DX_PRIORITY.csv", allDx);
    }

    console.log(`\nDone: ${added} added, ${skipped} skipped (already exist)`);
    console.log(`\nNext steps:`);
    console.log(`  1. Edit the CSV stubs with real clinical scoring rules`);
    console.log(`  2. Edit golden tests in tests/cases/<cc_id>/`);
    console.log(`  3. Run: npx tsx scripts/run_harness.ts --all`);
    return;
  }

  if (process.argv.length >= 5) {
    const ccId = process.argv[2].toLowerCase().replace(/[\s-]+/g, "_");
    const sys = process.argv[3].toUpperCase();
    const label = process.argv[4];
    const aliases = process.argv[5] || ccId;
    const existingIds = getExistingCcIds();

    if (existingIds.has(ccId)) {
      console.error(`Error: ${ccId} already exists in COMPLAINT_REGISTRY.csv`);
      process.exit(1);
    }

    const seed: SeedRow = { CC_ID: ccId, SYSTEM: sys, LABEL: label, ALIASES: aliases, DEFAULT_CLUSTER: "" };
    const gen = generateOne(seed);

    appendCsv("COMPLAINT_REGISTRY.csv", [gen.registryRow]);
    appendCsv("CORE_QUESTIONS.csv", gen.questionsRows);
    appendCsv("RED_FLAG_RULES.csv", gen.rfRows);
    appendCsv("CLUSTER_SCORING_RULES.csv", gen.csrRows);
    appendCsv("DISPOSITION_RULES.csv", gen.dispRows);
    appendCsv("OUTPUT_TEMPLATES.csv", gen.otRows);
    appendCsv("DX_PRIORITY.csv", gen.dxRows);

    const pfx = prefix(ccId);
    generateGoldenTests(ccId, label, pfx);

    console.log(`\nScaffolded ${ccId} (${sys} / ${label})`);
    console.log(`  - 1 registry row`);
    console.log(`  - 5 questions`);
    console.log(`  - 2 red flag rules`);
    console.log(`  - 7 cluster scoring rules (3 clusters)`);
    console.log(`  - 4 disposition rules`);
    console.log(`  - 4 output templates`);
    console.log(`  - 3 DX_PRIORITY rows`);
    console.log(`  - 10 golden tests in tests/cases/${ccId}/`);
    console.log(`\nNext: edit stubs with real clinical logic, then run harness`);
    return;
  }

  console.log(`Usage:`);
  console.log(`  Bulk:   npx tsx scripts/generate-complaints.ts <seed.csv>`);
  console.log(`  Single: npx tsx scripts/generate-complaints.ts <cc_id> <system> <label> [aliases]`);
  console.log(`\nSeed CSV columns: CC_ID, SYSTEM, LABEL, ALIASES`);
  console.log(`Example:`);
  console.log(`  npx tsx scripts/generate-complaints.ts data/complaints/seed.csv`);
  console.log(`  npx tsx scripts/generate-complaints.ts allergic_rhinitis ENT "Allergic Rhinitis" "runny_nose;sneezing;hay_fever"`);
}

main();
