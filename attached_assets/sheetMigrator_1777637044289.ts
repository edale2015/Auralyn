/**
 * sheetMigrator.ts
 * Drop into: server/clinical/sheetMigrator.ts
 *
 * GOOGLE SHEETS → AURALYN PATHWAY MIGRATOR
 *
 * PURPOSE:
 * Your Google Sheets represent one year of clinical development.
 * This tool imports them and produces ComplaintPathway objects
 * ready for physician review and KB loading.
 *
 * EXPECTED SHEET STRUCTURE:
 * Export each system's sheet as CSV. The migrator handles common
 * column name variations since Sheets evolve over time.
 *
 * MIGRATION PROCESS:
 * 1. Export Google Sheet tab as CSV
 * 2. Run: npx tsx server/clinical/sheetMigrator.ts --csv path/to/sheet.csv
 * 3. Review the validation report
 * 4. Clinically review any pathway scoring below 80
 * 5. Add LR table values (requires clinical reference — not auto-generated)
 * 6. Run validate() on completed pathways
 * 7. Load into KB via POST /api/clinical/pathways/load
 *
 * USAGE:
 *   import { SheetMigrator } from "./sheetMigrator";
 *   const migrator = new SheetMigrator();
 *   const result   = await migrator.fromCSV("./sheets/cardiovascular.csv");
 *   console.log(result.report);
 */

import * as fs   from "fs";
import * as path from "path";
import { validatePathway } from "./complaintPathwaySchema";
import type { ComplaintPathway, RedFlagRule, IntakeQuestion, DifferentialDiagnosis, PhysicalExam, WorkupProtocol, DispositionCriteria, TreatmentProtocol, PatientCommunication, FollowUpProtocol } from "./complaintPathwaySchema";

// ─── Column name normalization ────────────────────────────────────────────────
// Maps possible Google Sheet column headers to canonical field names.
// Add more aliases as you discover your actual sheet column names.

const COLUMN_ALIASES: Record<string, string> = {
  // Complaint identity
  "complaint":          "slug",
  "chief complaint":    "slug",
  "chief_complaint":    "slug",
  "cc":                 "slug",
  "name":               "displayName",
  "display name":       "displayName",
  "complaint name":     "displayName",
  "system":             "system",
  "body system":        "system",
  "acuity":             "acuityClass",
  "acuity class":       "acuityClass",
  "urgency":            "acuityClass",

  // Red flags
  "red flags":          "redFlagRaw",
  "red flag":           "redFlagRaw",
  "red flag symptoms":  "redFlagRaw",
  "emergent symptoms":  "redFlagRaw",
  "must not miss":      "redFlagRaw",
  "warning signs":      "redFlagRaw",

  // Differential
  "differential":       "differentialRaw",
  "differential diagnosis": "differentialRaw",
  "ddx":                "differentialRaw",
  "diagnoses":          "differentialRaw",
  "diagnose":           "differentialRaw",

  // Questions
  "intake questions":   "questionsRaw",
  "questions":          "questionsRaw",
  "secondary questions": "questionsRaw",
  "history questions":  "questionsRaw",
  "pertinent questions": "questionsRaw",

  // Physical exam
  "physical exam":      "physicalExamRaw",
  "exam":               "physicalExamRaw",
  "pe":                 "physicalExamRaw",
  "physical examination": "physicalExamRaw",
  "findings":           "physicalExamRaw",

  // Workup
  "workup":             "workupRaw",
  "labs":               "workupRaw",
  "tests":              "workupRaw",
  "lab tests":          "workupRaw",
  "diagnostic workup":  "workupRaw",
  "testing":            "workupRaw",

  // Treatment
  "treatment":          "treatmentRaw",
  "medications":        "treatmentRaw",
  "meds":               "treatmentRaw",
  "rx":                 "treatmentRaw",
  "management":         "treatmentRaw",

  // Disposition
  "disposition":        "dispositionRaw",
  "disposition criteria": "dispositionRaw",
  "discharge criteria": "dispositionRaw",

  // Return precautions
  "return precautions": "returnPrecautionsRaw",
  "precautions":        "returnPrecautionsRaw",
  "return to ed":       "returnPrecautionsRaw",
  "return instructions": "returnPrecautionsRaw",

  // Guidelines
  "guideline":          "guidelineSource",
  "guidelines":         "guidelineSource",
  "evidence":           "guidelineSource",
  "references":         "guidelineSource",
};

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines  = content.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Handle quoted fields properly
  function splitRow(row: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitRow(lines[0]).map(h =>
    COLUMN_ALIASES[h.toLowerCase().trim()] ?? h.toLowerCase().trim().replace(/\s+/g, "_")
  );

  return lines.slice(1).map(line => {
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (values[i]) row[h] = values[i].trim();
    });
    return row;
  }).filter(row => Object.values(row).some(v => v.length > 0));
}

// ─── Field parsers ────────────────────────────────────────────────────────────
// These parse the free-text cell content from your Google Sheets
// into structured pathway fields. They handle common formatting
// like semicolons, newlines, numbered lists, bullet points.

function parseToList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/\r\n/g, "\n")
    .split(/[;\n|•·]/)
    .map(s => s.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter(s => s.length > 3);
}

function parseRedFlags(raw: string): RedFlagRule[] {
  const items = parseToList(raw);
  return items.map((item, i) => {
    // Try to extract condition from format "Symptom → Condition" or "Symptom (Condition)"
    const arrowMatch = item.match(/^(.+?)\s*[→\->:]\s*(.+)$/);
    const parenMatch = item.match(/^(.+?)\s*\((.+?)\)/);

    const symptom   = arrowMatch?.[1] ?? parenMatch?.[1] ?? item;
    const condition = arrowMatch?.[2] ?? parenMatch?.[2] ?? "Life-threatening condition — review required";

    return {
      id:        `rf_imported_${String(i + 1).padStart(2, "0")}`,
      symptom:   symptom.trim(),
      condition: condition.trim(),
      action:    "ER_URGENT" as const,  // default — physician must review
      rationale: "Imported from Google Sheets — physician review required",
      pearls:    [],
    };
  });
}

function parseQuestions(raw: string): IntakeQuestion[] {
  const items = parseToList(raw);
  return items.map((item, i) => ({
    id:              `q_imported_${String(i + 1).padStart(2, "0")}`,
    question:        item.trim(),
    type:            "boolean" as const,
    clinicalPurpose: "Imported from Google Sheets — review and add clinical purpose",
  }));
}

function parseDifferential(raw: string): DifferentialDiagnosis[] {
  const items = parseToList(raw);
  const count = items.length || 1;

  return items.map((item, i) => {
    const arrowMatch = item.match(/^(.+?)\s*[→\->:]\s*(.+)$/);
    const diagnosis  = arrowMatch?.[1]?.trim() ?? item.trim();

    // Assign rough equal priors — MUST be reviewed and calibrated by physician
    const prior = Math.round((1 / count) * 100) / 100;

    return {
      diagnosis,
      icdCode:     "REVIEW_REQUIRED",
      prior,
      urgency:     "routine" as const,  // must be reviewed
      mustNotMiss: false,               // physician must flag must-not-miss diagnoses
      likelihoodRatios: {
        supportingFindings: [
          {
            finding: "REVIEW REQUIRED — add likelihood ratio data from clinical references",
            lr:      1.0,
            source:  "Imported from Google Sheets — add evidence source",
          },
        ],
      },
      treatmentPrinciples: arrowMatch?.[2]?.trim() ?? "REVIEW REQUIRED",
      dispositionDefault:  "URGENT_CARE" as const,
    };
  });
}

function parsePhysicalExam(raw: string): PhysicalExam {
  const items = parseToList(raw);
  return {
    required:    items.length > 0 ? items : ["REVIEW REQUIRED — add required exam components"],
    conditional: [],
    findings:    items.map(item => ({
      finding:   item,
      indicates: "REVIEW REQUIRED — add clinical significance",
      urgency:   "informational" as const,
    })),
  };
}

function parseWorkup(raw: string): WorkupProtocol {
  const items = parseToList(raw);
  return {
    alwaysOrder: [],
    orderIf:     items.map(item => ({
      test:      item,
      condition: "REVIEW REQUIRED — add clinical indication",
      urgency:   "routine" as const,
    })),
    neverOrder: [],
  };
}

function parseTreatment(raw: string): TreatmentProtocol {
  const items = parseToList(raw);
  return {
    firstLine: items.slice(0, 3).map(item => {
      // Try to parse "Medication: dose, route, duration" format
      const colonMatch = item.match(/^(.+?):\s*(.+)$/);
      return {
        medication:         colonMatch?.[1]?.trim() ?? item.trim(),
        dose:               colonMatch?.[2]?.trim() ?? "REVIEW REQUIRED",
        route:              "Oral",
        duration:           "REVIEW REQUIRED",
        notes:              "Imported from Google Sheets — verify dose, route, duration",
        contraindicatedIn:  [],
      };
    }),
    alternatives:       [],
    nonPharmacologic:   items.slice(3),
    avoidInThisCondition: [],
  };
}

function parseDisposition(raw: string): DispositionCriteria {
  const items = parseToList(raw);

  // Try to split into ER vs UC vs PCP vs home based on keywords
  const erItems  = items.filter(i => /er|emergency|immediate|urgent|hospital|admit/i.test(i));
  const ucItems  = items.filter(i => /urgent care|uc|clinic/i.test(i));
  const pcpItems = items.filter(i => /pcp|primary|follow.?up|referral/i.test(i));
  const homeItems = items.filter(i => /home|self.?care|discharge|outpatient/i.test(i));
  const remaining = items.filter(i => ![...erItems, ...ucItems, ...pcpItems, ...homeItems].includes(i));

  return {
    erSend:     erItems.length > 0 ? erItems : ["REVIEW REQUIRED — add ER criteria"],
    urgentCare: ucItems.length > 0 ? ucItems : remaining,
    pcp:        pcpItems,
    selfCare:   homeItems,
    safetyNets: ["REVIEW REQUIRED — add specific return precautions"],
  };
}

function parsePatientCommunication(returnPrecautionsRaw: string): PatientCommunication {
  const precautions = parseToList(returnPrecautionsRaw);
  return {
    diagnosisExplanation: "REVIEW REQUIRED — add patient-friendly diagnosis explanation",
    treatmentExplanation: "REVIEW REQUIRED — add treatment explanation",
    returnPrecautions:    precautions.length > 0 ? precautions : ["REVIEW REQUIRED — add return precautions"],
    followUpInstructions: "REVIEW REQUIRED — add follow-up instructions",
    preventionCounseling: "REVIEW REQUIRED — add prevention advice",
    npsDrivers:           [
      "Explain the diagnosis in plain language",
      "Set clear expectations for symptom timeline",
      "Provide specific return precautions in writing",
    ],
  };
}

// ─── Slug generator ───────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[\/\(\)]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// ─── Main migrator ────────────────────────────────────────────────────────────

export interface MigrationResult {
  pathways:  Partial<ComplaintPathway>[];
  report:    MigrationReport;
}

export interface MigrationReport {
  totalRows:        number;
  successCount:     number;
  warningCount:     number;
  errorCount:       number;
  pathwayScores:    Array<{ slug: string; score: number; errors: string[]; warnings: string[] }>;
  readyForProduction: string[];   // slugs scoring ≥ 80 with no errors
  needsReview:      string[];     // slugs scoring < 80
  criticalGaps:     string[];     // specific gaps that could cause patient harm
}

export class SheetMigrator {

  fromCSV(csvPath: string): MigrationResult {
    const content = fs.readFileSync(csvPath, "utf-8");
    return this.fromCSVString(content);
  }

  fromCSVString(content: string): MigrationResult {
    const rows = parseCSV(content);
    const pathways: Partial<ComplaintPathway>[] = [];
    const pathwayScores: MigrationReport["pathwayScores"] = [];

    for (const row of rows) {
      const rawName = row.displayName ?? row.slug ?? row.complaint ?? row.name ?? "";
      if (!rawName) continue;

      const slug = toSlug(row.slug ?? rawName);

      const pathway: Partial<ComplaintPathway> = {
        slug,
        displayName:   row.displayName ?? rawName,
        system:        (row.system as any) ?? "general",
        acuityClass:   (row.acuityClass as any) ?? "routine",
        prevalence:    "common",
        guidelineSource: row.guidelineSource ? parseToList(row.guidelineSource) : [],
        lastClinicalReview: new Date().toISOString().split("T")[0],
        reviewedBy:    "physician_review_required",
        version:       1,
      };

      if (row.redFlagRaw)             pathway.redFlags           = parseRedFlags(row.redFlagRaw);
      if (row.questionsRaw)           pathway.intakeQuestions    = parseQuestions(row.questionsRaw);
      if (row.differentialRaw)        pathway.differential       = parseDifferential(row.differentialRaw);
      if (row.physicalExamRaw)        pathway.physicalExam       = parsePhysicalExam(row.physicalExamRaw);
      if (row.workupRaw)              pathway.workup             = parseWorkup(row.workupRaw);
      if (row.treatmentRaw)           pathway.treatment          = parseTreatment(row.treatmentRaw);
      if (row.dispositionRaw)         pathway.dispositionCriteria = parseDisposition(row.dispositionRaw);
      if (row.returnPrecautionsRaw)   pathway.patientCommunication = parsePatientCommunication(row.returnPrecautionsRaw);

      // Default follow-up
      pathway.followUp = {
        enrollIf: ["Chronic disease follow-up appropriate — physician review required"],
        checkIns: [{ dayOffset: 2, questions: ["Are your symptoms improving?"], escalationTrigger: "Symptoms worsening" }],
      };

      pathways.push(pathway);

      // Validate
      try {
        const validation = validatePathway(pathway as ComplaintPathway);
        pathwayScores.push({
          slug,
          score:    validation.score,
          errors:   validation.errors,
          warnings: validation.warnings,
        });
      } catch {
        pathwayScores.push({ slug, score: 0, errors: ["Validation failed — pathway incomplete"], warnings: [] });
      }
    }

    const readyForProduction = pathwayScores.filter(p => p.score >= 80 && p.errors.length === 0).map(p => p.slug);
    const needsReview        = pathwayScores.filter(p => p.score < 80 || p.errors.length > 0).map(p => p.slug);
    const criticalGaps       = pathwayScores
      .filter(p => p.errors.some(e => e.includes("must-not-miss") || e.includes("red flag") || e.includes("return precautions")))
      .map(p => `${p.slug}: ${p.errors.filter(e => e.includes("must-not-miss") || e.includes("red flag") || e.includes("return precautions")).join("; ")}`);

    const report: MigrationReport = {
      totalRows:          rows.length,
      successCount:       readyForProduction.length,
      warningCount:       pathwayScores.filter(p => p.warnings.length > 0).length,
      errorCount:         pathwayScores.filter(p => p.errors.length > 0).length,
      pathwayScores,
      readyForProduction,
      needsReview,
      criticalGaps,
    };

    return { pathways, report };
  }

  // Save migrated pathways to JSON files for physician review
  saveMigrationOutput(result: MigrationResult, outputDir: string): void {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Save each pathway as its own file
    for (const pathway of result.pathways) {
      const filePath = path.join(outputDir, `${pathway.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(pathway, null, 2));
    }

    // Save the report
    fs.writeFileSync(
      path.join(outputDir, "_migration_report.json"),
      JSON.stringify(result.report, null, 2)
    );

    // Save a human-readable review checklist
    const checklist = this.generateReviewChecklist(result);
    fs.writeFileSync(path.join(outputDir, "_physician_review_checklist.md"), checklist);

    console.log(`Migration complete: ${result.pathways.length} pathways saved to ${outputDir}`);
    console.log(`Ready for production: ${result.report.readyForProduction.length}`);
    console.log(`Needs physician review: ${result.report.needsReview.length}`);
    console.log(`Critical gaps: ${result.report.criticalGaps.length}`);
  }

  private generateReviewChecklist(result: MigrationResult): string {
    const lines: string[] = [
      "# Physician Review Checklist",
      `Generated: ${new Date().toISOString()}`,
      "",
      `## Summary`,
      `- Total pathways migrated: ${result.report.totalRows}`,
      `- Ready for production: ${result.report.readyForProduction.length}`,
      `- Needs review: ${result.report.needsReview.length}`,
      `- Critical gaps: ${result.report.criticalGaps.length}`,
      "",
      "## Critical Gaps (Address First — Patient Safety)",
      "",
    ];

    for (const gap of result.report.criticalGaps) {
      lines.push(`- [ ] **${gap}**`);
    }

    lines.push("", "## Pathways Needing Review (Ordered by Priority)", "");

    for (const ps of result.report.pathwayScores.sort((a, b) => a.score - b.score)) {
      if (ps.score < 80 || ps.errors.length > 0) {
        lines.push(`### ${ps.slug} (Score: ${ps.score}/100)`);
        if (ps.errors.length > 0) {
          lines.push("**Errors (must fix):**");
          ps.errors.forEach(e => lines.push(`- [ ] ${e}`));
        }
        if (ps.warnings.length > 0) {
          lines.push("**Warnings (should fix):**");
          ps.warnings.forEach(w => lines.push(`- [ ] ${w}`));
        }
        lines.push("");
      }
    }

    lines.push("## What AI Cannot Fill In", "");
    lines.push([
      "The following require YOUR clinical judgment — AI-generated values are placeholders:",
      "",
      "1. **Likelihood ratios** — The lr values in differential.likelihoodRatios must come from",
      "   clinical studies or validated decision rules. Never use AI-generated LR values clinically.",
      "   Sources: Deeks & Altman systematic reviews, original studies, clinical decision rules.",
      "",
      "2. **mustNotMiss flags** — You must review each diagnosis and mark which ones are",
      "   life-threatening if missed. This is your clinical judgment, not an algorithm.",
      "",
      "3. **Disposition defaults** — The default disposition for each diagnosis must reflect",
      "   your clinical experience. AI defaults to URGENT_CARE — review every one.",
      "",
      "4. **Treatment doses** — All medication doses must be verified against current references.",
      "   Never use AI-generated doses without verification.",
      "",
      "5. **Red flag actions** — Review every red flag and confirm the action level",
      "   (ER_IMMEDIATE vs ER_URGENT vs ESCALATE_TO_PHYSICIAN).",
    ].join("\n"));

    return lines.join("\n");
  }
}

// ─── CLI runner ───────────────────────────────────────────────────────────────
// Run: npx tsx server/clinical/sheetMigrator.ts --csv ./sheets/cardiovascular.csv --out ./migration-output

if (require.main === module) {
  const args    = process.argv.slice(2);
  const csvIdx  = args.indexOf("--csv");
  const outIdx  = args.indexOf("--out");
  const csvPath = csvIdx !== -1 ? args[csvIdx + 1] : null;
  const outPath = outIdx !== -1 ? args[outIdx + 1] : "./migration-output";

  if (!csvPath) {
    console.error("Usage: npx tsx sheetMigrator.ts --csv path/to/sheet.csv [--out output/dir]");
    process.exit(1);
  }

  const migrator = new SheetMigrator();
  const result   = migrator.fromCSV(csvPath);
  migrator.saveMigrationOutput(result, outPath);
}
