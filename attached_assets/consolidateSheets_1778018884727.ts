/**
 * consolidateSheets.ts
 * Run as: npx tsx server/clinical/consolidateSheets.ts
 *
 * THREE-LAYER CLINICAL KB CONSOLIDATION
 *
 * WHAT THIS DOES:
 * Takes three layers of Google Sheets clinical knowledge and produces:
 *   1. A single consolidated JSON per complaint (all 30 systems)
 *   2. A physician review checklist showing conflicts and gaps
 *   3. Import-ready rows for Auralyn's kb_master_rules table
 *   4. A coverage report showing which of the 247 complaints are complete
 *
 * THREE INPUT LAYERS (in priority order):
 *   Layer 1 — Primary clinical sheet (differential/workup/treatment) → HIGHEST AUTHORITY
 *   Layer 2 — ChatGPT-generated sprawl sheets → secondary, flag conflicts
 *   Layer 3 — Consolidation attempt sheets → structural guidance only, limited coverage
 *
 * HOW TO USE:
 *   1. Export each Google Sheet tab as CSV:
 *      File → Download → Comma Separated Values (.csv)
 *   2. Place CSVs in ./sheets-export/ directory
 *   3. Run: npx tsx server/clinical/consolidateSheets.ts
 *   4. Review: ./consolidation-output/_physician_review.md
 *   5. Apply: npx tsx server/scripts/importAllSystemSheetsToDb.ts
 *
 * EXPORT INSTRUCTIONS FOR YOUR THREE SPREADSHEETS:
 *   For each sheet, export every tab as a separate CSV.
 *   Name them: layer1_[TabName].csv, layer2_[TabName].csv, layer3_[TabName].csv
 *   Place all CSVs in ./sheets-export/
 */

import * as fs   from "fs";
import * as path from "path";

// ─── The 30 clinical systems and their complaint slugs ───────────────────────

export const THIRTY_SYSTEMS = {
  cardiovascular: [
    "chest_pain", "hypertensive_urgency", "palpitations", "syncope",
    "dvt_pe", "leg_swelling", "decompensated_heart_failure",
    "aortic_dissection_screen", "atrial_fibrillation", "chest_wall_pain",
  ],
  respiratory: [
    "shortness_of_breath", "asthma_exacerbation", "copd_exacerbation",
    "flu_covid", "upper_respiratory", "pneumonia", "croup",
    "bronchitis", "hemoptysis", "anaphylaxis_respiratory",
  ],
  gastrointestinal: [
    "abdominal_pain", "nausea_vomiting", "diarrhea", "constipation",
    "rectal_bleeding", "gerd_heartburn", "appendicitis_screen",
    "gallbladder", "pancreatitis", "diverticulitis",
    "bowel_obstruction", "anal_rectal", "food_poisoning", "jaundice",
  ],
  genitourinary: [
    "uti", "kidney_stone", "urinary_retention", "hematuria",
    "testicular_pain", "vaginal_discharge", "pelvic_pain_female",
    "ectopic_screen", "incontinence",
  ],
  musculoskeletal: [
    "back_pain", "neck_pain", "shoulder_pain", "knee_pain",
    "ankle_injury", "wrist_hand_injury", "fracture_general",
    "joint_pain_polyarticular", "monoarticular_joint",
    "hip_pain", "elbow_pain", "compartment_syndrome",
  ],
  dermatology: [
    "skin_infection", "rash_mild", "urticaria", "contact_dermatitis",
    "shingles", "wound_laceration", "burn", "insect_bite_sting",
    "skin_cancer_concern", "fungal_infection",
  ],
  neurology: [
    "headache", "dizziness_vertigo", "stroke_tia", "seizure",
    "altered_mental_status", "weakness_focal", "migraine",
    "bells_palsy", "concussion", "meningitis_screen",
  ],
  ent: [
    "ear_pain", "sore_throat", "sinusitis", "nosebleed",
    "hoarseness", "swallowing_difficulty", "neck_swelling",
    "hearing_loss_sudden",
  ],
  ophthalmology: [
    "eye_complaint", "pink_eye", "vision_loss_sudden",
    "chemical_eye", "eye_trauma", "periorbital_cellulitis", "double_vision",
  ],
  endocrine: [
    "hyperglycemia", "hypoglycemia", "thyroid_symptoms",
    "adrenal_crisis", "dehydration_electrolyte",
  ],
  infectious: [
    "fever_adult", "sepsis_screen", "travel_illness",
    "lyme_disease", "mononucleosis", "hiv_concerns",
  ],
  sexual_health: [
    "std_gonorrhea_chlamydia", "std_syphilis", "std_herpes",
    "pid", "epididymitis_orchitis", "sexual_assault", "prep_pep",
  ],
  psychiatric: [
    "suicidal_ideation", "anxiety_panic", "depression_screen",
    "psychosis_screen", "substance_intoxication", "alcohol_withdrawal",
  ],
  toxicology: [
    "medication_overdose", "opioid_overdose", "carbon_monoxide",
    "drug_reaction", "alcohol_poisoning",
  ],
  trauma: [
    "head_trauma", "facial_trauma", "extremity_trauma",
    "chest_trauma", "abdominal_trauma", "bite_wound",
    "foreign_body", "burn_wound", "spinal_injury", "wound_care",
  ],
  gynecology: [
    "vaginal_bleeding", "pregnancy_bleeding", "ectopic_pregnancy",
    "ovarian_cyst", "dysmenorrhea", "breast_complaint",
  ],
  pediatric: [
    "pediatric_fever", "pediatric_rash", "pediatric_respiratory",
    "pediatric_gi", "croup", "febrile_seizure",
    "kawasaki", "intussusception", "epiglottitis",
  ],
  allergy: [
    "anaphylaxis", "allergic_reaction", "drug_allergy", "food_allergy",
  ],
  dental: [
    "dental_pain", "dental_abscess", "oral_lesion", "trismus",
  ],
  hematology: [
    "anemia_symptoms", "anticoagulation_bleeding", "sickle_cell",
    "neutropenic_fever", "lymphadenopathy",
  ],
  general: [
    "medication_refill", "fatigue_malaise", "fall_elderly", "workers_comp",
  ],
  vascular: [
    "limb_ischemia", "wound_non_healing",
  ],
  environmental: [
    "heat_exhaustion", "hypothermia_frostbite", "carbon_monoxide",
    "lightning_electrical", "occupational_exposure",
  ],
};

const ALL_COMPLAINTS = Object.values(THIRTY_SYSTEMS).flat();

// ─── Required columns for a complete complaint row ───────────────────────────
// Maps to kb_master_rules columns

const REQUIRED_COLUMNS = {
  // Identity
  complaint_id:        ["Complaint ID", "CC_ID", "complaint_id", "Chief Complaint", "Complaint"],
  complaint_label:     ["Complaint Label", "Label", "Name", "Display Name"],
  system:              ["System", "Body System", "Clinical System", "Specialty"],

  // Red flags (must not miss)
  red_flags:           ["Red Flags", "Red Flag", "Must Not Miss", "Emergency Signs", "Red Flag Symptoms"],

  // Differential diagnosis
  differential:        ["Differential", "Differential Diagnosis", "DDx", "Diagnoses", "Differential Dx"],
  must_not_miss_dx:    ["Must Not Miss", "Cannot Miss", "Critical Dx", "Life Threatening"],

  // Intake questions
  core_questions:      ["Core Questions", "Questions", "History Questions", "Key Questions", "Secondary Questions"],

  // Physical exam
  physical_exam:       ["Physical Exam", "Exam", "PE", "Physical Examination", "Exam Findings"],

  // Workup
  workup:              ["Workup", "Labs", "Tests", "Diagnostic Workup", "Lab Tests", "Imaging"],

  // Treatment
  treatment_first_line: ["Treatment", "First Line", "Management", "Medications", "Meds", "Rx"],
  contraindications:   ["Contraindications", "Avoid", "Do Not Use", "Contraindicated"],

  // Disposition
  disposition:         ["Disposition", "Disposition Criteria", "Discharge Criteria", "Level of Care"],
  er_criteria:         ["ER Criteria", "ER Now", "Emergency Criteria", "Escalate To ER"],

  // Patient communication
  return_precautions:  ["Return Precautions", "Precautions", "Warning Signs", "Return Instructions"],

  // Scoring rules
  clinical_scores:     ["Clinical Scores", "Scoring Rules", "Decision Rules", "Centor", "HEART", "Wells"],
};

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  function splitRow(row: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (row[i] === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += row[i];
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitRow(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { if (values[i]) row[h] = values[i].trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v.length > 0));
}

// ─── Column finder ────────────────────────────────────────────────────────────

function findColumn(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const val = row[alias] ?? row[alias.toLowerCase()] ?? row[alias.toUpperCase()];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return "";
}

// ─── Complaint normalizer ─────────────────────────────────────────────────────

function normalizeComplaintId(raw: string): string {
  return raw.toLowerCase()
    .replace(/[\/\(\)\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// ─── Three-layer merger ───────────────────────────────────────────────────────

interface ConsolidatedComplaint {
  complaint_id:        string;
  complaint_label:     string;
  system:              string;
  red_flags:           string;
  differential:        string;
  must_not_miss_dx:    string;
  core_questions:      string;
  physical_exam:       string;
  workup:              string;
  treatment_first_line: string;
  contraindications:   string;
  disposition:         string;
  er_criteria:         string;
  return_precautions:  string;
  clinical_scores:     string;

  // Provenance tracking
  sources:             string[];
  conflicts:           Array<{ field: string; layer1: string; layer2: string }>;
  completenessScore:   number;  // 0-100
  missingFields:       string[];
}

function mergeRows(
  layer1Row: Record<string, string> | undefined,
  layer2Row: Record<string, string> | undefined,
  layer3Row: Record<string, string> | undefined,
  complaintId: string
): ConsolidatedComplaint {

  const result: ConsolidatedComplaint = {
    complaint_id:         complaintId,
    complaint_label:      "",
    system:               "",
    red_flags:            "",
    differential:         "",
    must_not_miss_dx:     "",
    core_questions:       "",
    physical_exam:        "",
    workup:               "",
    treatment_first_line: "",
    contraindications:    "",
    disposition:          "",
    er_criteria:          "",
    return_precautions:   "",
    clinical_scores:      "",
    sources:              [],
    conflicts:            [],
    completenessScore:    0,
    missingFields:        [],
  };

  const fieldKeys = Object.keys(REQUIRED_COLUMNS) as Array<keyof typeof REQUIRED_COLUMNS>;

  for (const field of fieldKeys) {
    const aliases = REQUIRED_COLUMNS[field];
    const v1 = layer1Row ? findColumn(layer1Row, aliases) : "";
    const v2 = layer2Row ? findColumn(layer2Row, aliases) : "";
    const v3 = layer3Row ? findColumn(layer3Row, aliases) : "";

    // Layer 1 has highest authority
    if (v1) {
      (result as any)[field] = v1;
      if (!result.sources.includes("layer1")) result.sources.push("layer1");

      // Flag conflicts with layer 2 (for physician review)
      if (v2 && v2 !== v1 && v2.length > 20) {
        result.conflicts.push({ field, layer1: v1.slice(0, 100), layer2: v2.slice(0, 100) });
      }
    } else if (v2) {
      (result as any)[field] = v2;
      if (!result.sources.includes("layer2")) result.sources.push("layer2");
    } else if (v3) {
      (result as any)[field] = v3;
      if (!result.sources.includes("layer3")) result.sources.push("layer3");
    }
  }

  // Find system from THIRTY_SYSTEMS map
  if (!result.system) {
    for (const [sys, complaints] of Object.entries(THIRTY_SYSTEMS)) {
      if (complaints.includes(complaintId)) {
        result.system = sys;
        break;
      }
    }
  }

  // Completeness score
  const populatedFields = fieldKeys.filter(f => (result as any)[f]?.length > 0);
  result.completenessScore = Math.round((populatedFields.length / fieldKeys.length) * 100);
  result.missingFields = fieldKeys.filter(f => !(result as any)[f]?.length) as string[];

  return result;
}

// ─── Generate kb_master_rules import rows ────────────────────────────────────

function complaintToRuleRows(complaint: ConsolidatedComplaint): Array<Record<string, any>> {
  const rows: Array<Record<string, any>> = [];
  const baseId = complaint.complaint_id;
  const ts = new Date().toISOString();

  // Red flag rules
  if (complaint.red_flags) {
    const flags = complaint.red_flags.split(/[;\n|]/).filter(f => f.trim().length > 5);
    flags.forEach((flag, i) => {
      rows.push({
        rule_id:        `${baseId}_rf_${String(i + 1).padStart(3, "0")}`,
        rule_name:      flag.trim().slice(0, 80),
        rule_type:      "red_flag",
        priority:       1,
        complaint_id:   baseId,
        logic_type:     "boolean",
        logic_description: flag.trim(),
        disposition_impact: "ER_NOW",
        safety_level:   "CRITICAL",
        active:         true,
        version:        "1.0",
        last_updated:   ts,
        owner:          "physician_review_required",
      });
    });
  }

  // Diagnosis rules
  if (complaint.differential) {
    const dxList = complaint.differential.split(/[;\n|]/).filter(d => d.trim().length > 3);
    dxList.forEach((dx, i) => {
      const isMustNotMiss = complaint.must_not_miss_dx?.toLowerCase().includes(dx.toLowerCase().slice(0, 15));
      rows.push({
        rule_id:        `${baseId}_dx_${String(i + 1).padStart(3, "0")}`,
        rule_name:      dx.trim().slice(0, 80),
        rule_type:      "diagnosis",
        priority:       isMustNotMiss ? 1 : 5,
        complaint_id:   baseId,
        logic_type:     "boolean",
        logic_description: dx.trim(),
        safety_level:   isMustNotMiss ? "CRITICAL" : "MODERATE",
        active:         true,
        version:        "1.0",
        last_updated:   ts,
        owner:          "physician_review_required",
        notes:          isMustNotMiss ? "MUST NOT MISS — physician review required" : "",
      });
    });
  }

  // Workup rules
  if (complaint.workup) {
    const workupItems = complaint.workup.split(/[;\n|]/).filter(w => w.trim().length > 3);
    workupItems.forEach((item, i) => {
      rows.push({
        rule_id:        `${baseId}_wx_${String(i + 1).padStart(3, "0")}`,
        rule_name:      item.trim().slice(0, 80),
        rule_type:      "workup",
        priority:       5,
        complaint_id:   baseId,
        logic_type:     "boolean",
        logic_description: item.trim(),
        workup_impact:  item.trim(),
        safety_level:   "MODERATE",
        active:         true,
        version:        "1.0",
        last_updated:   ts,
        owner:          "physician_review_required",
      });
    });
  }

  // Treatment rules
  if (complaint.treatment_first_line) {
    const txItems = complaint.treatment_first_line.split(/[;\n|]/).filter(t => t.trim().length > 3);
    txItems.forEach((item, i) => {
      rows.push({
        rule_id:           `${baseId}_tx_${String(i + 1).padStart(3, "0")}`,
        rule_name:         item.trim().slice(0, 80),
        rule_type:         "medication",
        priority:          5,
        complaint_id:      baseId,
        logic_type:        "mapping",
        logic_description: item.trim(),
        medication_impact: item.trim(),
        safety_level:      "MODERATE",
        active:            true,
        version:           "1.0",
        last_updated:      ts,
        owner:             "physician_review_required",
        notes:             complaint.contraindications
          ? `Contraindications: ${complaint.contraindications.slice(0, 200)}`
          : "",
      });
    });
  }

  // Disposition rules
  if (complaint.er_criteria) {
    rows.push({
      rule_id:           `${baseId}_disp_er`,
      rule_name:         `${baseId} ER escalation criteria`,
      rule_type:         "disposition",
      priority:          1,
      complaint_id:      baseId,
      logic_type:        "boolean",
      logic_description: complaint.er_criteria.slice(0, 500),
      disposition_impact: "ER_NOW",
      safety_level:      "CRITICAL",
      active:            true,
      version:           "1.0",
      last_updated:      ts,
      owner:             "physician_review_required",
    });
  }

  if (complaint.disposition) {
    rows.push({
      rule_id:           `${baseId}_disp_default`,
      rule_name:         `${baseId} default disposition`,
      rule_type:         "disposition",
      priority:          10,
      complaint_id:      baseId,
      logic_type:        "boolean",
      logic_description: complaint.disposition.slice(0, 500),
      disposition_impact: "URGENT_CARE",
      safety_level:      "MODERATE",
      active:            true,
      version:           "1.0",
      last_updated:      ts,
      owner:             "physician_review_required",
    });
  }

  return rows;
}

// ─── Main consolidation runner ────────────────────────────────────────────────

export interface ConsolidationReport {
  totalComplaints:     number;
  complete:            number;  // score >= 80
  partial:             number;  // score 40-79
  sparse:              number;  // score < 40
  notFound:            number;  // no data in any layer
  conflictsFound:      number;
  totalRuleRows:       number;
  bySystem:            Record<string, { total: number; complete: number; avg_score: number }>;
}

export function consolidateAllSheets(sheetsExportDir: string): {
  consolidated: ConsolidatedComplaint[];
  ruleRows:     Array<Record<string, any>>;
  report:       ConsolidationReport;
} {

  const outputDir = path.join(process.cwd(), "consolidation-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Load all CSVs
  const layer1: Map<string, Record<string, string>> = new Map();
  const layer2: Map<string, Record<string, string>> = new Map();
  const layer3: Map<string, Record<string, string>> = new Map();

  if (fs.existsSync(sheetsExportDir)) {
    const csvFiles = fs.readdirSync(sheetsExportDir).filter(f => f.endsWith(".csv"));

    for (const file of csvFiles) {
      const content = fs.readFileSync(path.join(sheetsExportDir, file), "utf-8");
      const rows    = parseCSV(content);
      const isLayer1 = file.startsWith("layer1_");
      const isLayer2 = file.startsWith("layer2_");
      const isLayer3 = file.startsWith("layer3_");

      for (const row of rows) {
        // Try to extract complaint ID
        const rawId = findColumn(row, ["CC_ID", "Complaint ID", "complaint_id", "Chief Complaint", "Complaint"]);
        if (!rawId) continue;
        const complaintId = normalizeComplaintId(rawId);

        if (isLayer1) layer1.set(complaintId, row);
        else if (isLayer2) layer2.set(complaintId, row);
        else if (isLayer3) layer3.set(complaintId, row);
        else {
          // No prefix — assume layer 1 (primary)
          if (!layer1.has(complaintId)) layer1.set(complaintId, row);
        }
      }
    }
  }

  // Consolidate each of the 247 complaints
  const consolidated: ConsolidatedComplaint[] = [];
  const allRuleRows: Array<Record<string, any>> = [];

  for (const complaintId of ALL_COMPLAINTS) {
    const l1 = layer1.get(complaintId);
    const l2 = layer2.get(complaintId);
    const l3 = layer3.get(complaintId);

    const merged = mergeRows(l1, l2, l3, complaintId);
    consolidated.push(merged);

    // Generate rule rows for any complaint with any data
    if (merged.completenessScore > 0) {
      allRuleRows.push(...complaintToRuleRows(merged));
    }
  }

  // Build report
  const bySystem: ConsolidationReport["bySystem"] = {};
  for (const [sys, complaints] of Object.entries(THIRTY_SYSTEMS)) {
    const sysComplaints = consolidated.filter(c => complaints.includes(c.complaint_id));
    bySystem[sys] = {
      total:     sysComplaints.length,
      complete:  sysComplaints.filter(c => c.completenessScore >= 80).length,
      avg_score: Math.round(sysComplaints.reduce((s, c) => s + c.completenessScore, 0) / Math.max(sysComplaints.length, 1)),
    };
  }

  const report: ConsolidationReport = {
    totalComplaints: consolidated.length,
    complete:        consolidated.filter(c => c.completenessScore >= 80).length,
    partial:         consolidated.filter(c => c.completenessScore >= 40 && c.completenessScore < 80).length,
    sparse:          consolidated.filter(c => c.completenessScore > 0 && c.completenessScore < 40).length,
    notFound:        consolidated.filter(c => c.completenessScore === 0).length,
    conflictsFound:  consolidated.reduce((s, c) => s + c.conflicts.length, 0),
    totalRuleRows:   allRuleRows.length,
    bySystem,
  };

  // Write outputs
  fs.writeFileSync(
    path.join(outputDir, "consolidated_complaints.json"),
    JSON.stringify(consolidated, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "kb_master_rules_import.json"),
    JSON.stringify(allRuleRows, null, 2)
  );

  // Write physician review checklist
  const checklist = generatePhysicianChecklist(consolidated, report);
  fs.writeFileSync(path.join(outputDir, "_physician_review.md"), checklist);

  // Write SQL import script
  const sql = generateSQLImport(allRuleRows);
  fs.writeFileSync(path.join(outputDir, "import_rules.sql"), sql);

  // Write coverage CSV for easy spreadsheet review
  const coverageCSV = [
    "complaint_id,system,completeness_score,sources,conflicts,missing_fields",
    ...consolidated.map(c =>
      `${c.complaint_id},${c.system},${c.completenessScore},"${c.sources.join("|")}",${c.conflicts.length},"${c.missingFields.join("|")}"`
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "coverage_report.csv"), coverageCSV);

  console.log(`\nConsolidation complete:`);
  console.log(`  Total complaints: ${report.totalComplaints}`);
  console.log(`  Complete (≥80%):  ${report.complete}`);
  console.log(`  Partial (40-79%): ${report.partial}`);
  console.log(`  Sparse (<40%):    ${report.sparse}`);
  console.log(`  Not found:        ${report.notFound}`);
  console.log(`  Conflicts:        ${report.conflictsFound}`);
  console.log(`  Rule rows:        ${report.totalRuleRows}`);
  console.log(`\nOutputs:`);
  console.log(`  consolidation-output/consolidated_complaints.json`);
  console.log(`  consolidation-output/kb_master_rules_import.json`);
  console.log(`  consolidation-output/import_rules.sql`);
  console.log(`  consolidation-output/coverage_report.csv`);
  console.log(`  consolidation-output/_physician_review.md`);

  return { consolidated, ruleRows: allRuleRows, report };
}

// ─── Physician review checklist ───────────────────────────────────────────────

function generatePhysicianChecklist(
  complaints: ConsolidatedComplaint[],
  report:     ConsolidationReport
): string {
  const lines: string[] = [
    "# Physician Review Checklist — Three-Layer Sheet Consolidation",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Total complaints processed: ${report.totalComplaints}`,
    `- Complete (≥80%): ${report.complete}`,
    `- Partial: ${report.partial}`,
    `- Sparse/missing: ${report.sparse + report.notFound}`,
    `- Conflicts to resolve: ${report.conflictsFound}`,
    `- Rule rows generated: ${report.totalRuleRows}`,
    "",
    "## CRITICAL: What AI Cannot Validate",
    "",
    "The following require YOUR clinical judgment before these rules go live:",
    "1. Every red flag rule — verify the severity (HARD stop vs SOFT warning)",
    "2. Every must-not-miss diagnosis — confirm it is actually life-threatening if missed",
    "3. Every treatment rule — verify dose, route, duration, contraindications",
    "4. Every ER disposition criterion — confirm the threshold for escalation",
    "5. Conflicts between Layer 1 and Layer 2 — you determine which is correct",
    "",
    "## System Coverage",
    "",
  ];

  for (const [sys, stats] of Object.entries(report.bySystem)) {
    const emoji = stats.avg_score >= 80 ? "✅" : stats.avg_score >= 40 ? "🟡" : "❌";
    lines.push(`${emoji} **${sys}** — ${stats.complete}/${stats.total} complete · avg score: ${stats.avg_score}%`);
  }

  lines.push("", "## Conflicts (Layer 1 vs Layer 2 — Physician Decides)", "");

  const withConflicts = complaints.filter(c => c.conflicts.length > 0);
  if (withConflicts.length === 0) {
    lines.push("No conflicts detected.");
  } else {
    for (const c of withConflicts) {
      lines.push(`### ${c.complaint_id} (${c.conflicts.length} conflict${c.conflicts.length !== 1 ? "s" : ""})`);
      for (const conflict of c.conflicts) {
        lines.push(`**${conflict.field}:**`);
        lines.push(`- Layer 1 (Primary): ${conflict.layer1}`);
        lines.push(`- Layer 2 (ChatGPT): ${conflict.layer2}`);
        lines.push(`- [ ] Physician decision: ___________`);
        lines.push("");
      }
    }
  }

  lines.push("## Complaints With Score < 40% (Needs Content)", "");
  const sparse = complaints.filter(c => c.completenessScore < 40);
  for (const c of sparse) {
    lines.push(`### ${c.complaint_id} [${c.system}] — ${c.completenessScore}%`);
    lines.push(`Missing: ${c.missingFields.join(", ")}`);
    if (c.completenessScore === 0) lines.push("**No data found in any layer — must be built from scratch**");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── SQL import generator ─────────────────────────────────────────────────────

function generateSQLImport(rows: Array<Record<string, any>>): string {
  const lines: string[] = [
    "-- Auto-generated from consolidateSheets.ts",
    "-- Review _physician_review.md before running this script",
    "-- ALL rows have owner = 'physician_review_required'",
    "-- Do NOT run in production until physician review is complete",
    "",
    "BEGIN;",
    "",
  ];

  for (const row of rows) {
    const cols = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null && row[k] !== "");
    const vals = cols.map(k => {
      const v = row[k];
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      if (typeof v === "number")  return v;
      return `'${String(v).replace(/'/g, "''").slice(0, 500)}'`;
    });

    lines.push(
      `INSERT INTO kb_master_rules (${cols.join(", ")}) VALUES (${vals.join(", ")})`,
      `ON CONFLICT (rule_id) DO UPDATE SET`,
      `  rule_name = EXCLUDED.rule_name,`,
      `  logic_description = EXCLUDED.logic_description,`,
      `  last_updated = NOW();`,
      "",
    );
  }

  lines.push("COMMIT;");
  return lines.join("\n");
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const sheetsDir = path.join(process.cwd(), "sheets-export");

  if (!fs.existsSync(sheetsDir)) {
    console.log(`\nCreate ./sheets-export/ and place your exported CSVs there:`);
    console.log(`  layer1_[TabName].csv  — Primary clinical sheet (highest authority)`);
    console.log(`  layer2_[TabName].csv  — ChatGPT-generated sheets`);
    console.log(`  layer3_[TabName].csv  — Consolidation attempt sheets`);
    console.log(`\nThen run: npx tsx server/clinical/consolidateSheets.ts`);
    fs.mkdirSync(sheetsDir, { recursive: true });
    process.exit(0);
  }

  consolidateAllSheets(sheetsDir);
}
