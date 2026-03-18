import { google } from "googleapis";
import { PackRepository } from "./packRepository";
import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("|").map(x => x.trim()).filter(Boolean);
}

function joinCsv(values: string[] | undefined): string {
  return (values || []).join("|");
}

export class GoogleSheetsPackRepository implements PackRepository {
  private sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = process.env.PACKS_SPREADSHEET_ID || "";
  }

  async getSymptomRows(): Promise<SymptomPackRow[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "Symptom_Packs!A2:M",
    });

    const rows = res.data.values || [];

    return rows.map((r): SymptomPackRow => ({
      id: r[0] || "",
      system: r[1] || "",
      tier: "symptom",
      title: r[2] || "",
      isActive: String(r[3]).toLowerCase() === "true",
      version: Number(r[4] || 1),
      tags: splitCsv(r[5]),
      aliases: splitCsv(r[6]),
      likelyDisposition: (r[7] || "telemed_now") as SymptomPackRow["likelyDisposition"],
      questionsJson: r[8] || "[]",
      redFlags: splitCsv(r[9]),
      autoEscalateRules: splitCsv(r[10]),
      autoReviewRules: splitCsv(r[11]),
      planTemplateKey: r[12] || "",
    }));
  }

  async getModifierRows(): Promise<ModifierPackRow[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "Modifier_Packs!A2:I",
    });

    const rows = res.data.values || [];

    return rows.map((r): ModifierPackRow => ({
      id: r[0] || "",
      system: r[1] || "",
      tier: "modifier",
      title: r[2] || "",
      isActive: String(r[3]).toLowerCase() === "true",
      version: Number(r[4] || 1),
      tags: splitCsv(r[5]),
      appliesToSymptoms: splitCsv(r[6]),
      triggers: splitCsv(r[7]),
      riskAdjustmentsJson: r[8] || "[]",
    }));
  }

  async getAlgorithmRows(): Promise<ClinicianAlgorithmRow[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "Clinician_Algorithms!A2:J",
    });

    const rows = res.data.values || [];

    return rows.map((r): ClinicianAlgorithmRow => ({
      id: r[0] || "",
      system: r[1] || "",
      tier: "clinician_algorithm",
      title: r[2] || "",
      isActive: String(r[3]).toLowerCase() === "true",
      version: Number(r[4] || 1),
      tags: splitCsv(r[5]),
      entryCriteria: splitCsv(r[6]),
      requiredInputs: splitCsv(r[7]),
      outputActions: splitCsv(r[8]),
      notes: splitCsv(r[9]),
    }));
  }

  async saveSymptomRow(row: SymptomPackRow): Promise<void> {
    await this.upsertRow("Symptom_Packs", row.id, [
      row.id,
      row.system,
      row.title,
      String(row.isActive),
      String(row.version),
      joinCsv(row.tags),
      joinCsv(row.aliases),
      row.likelyDisposition,
      row.questionsJson,
      joinCsv(row.redFlags),
      joinCsv(row.autoEscalateRules),
      joinCsv(row.autoReviewRules),
      row.planTemplateKey,
    ]);
  }

  async saveModifierRow(row: ModifierPackRow): Promise<void> {
    await this.upsertRow("Modifier_Packs", row.id, [
      row.id,
      row.system,
      row.title,
      String(row.isActive),
      String(row.version),
      joinCsv(row.tags),
      joinCsv(row.appliesToSymptoms),
      joinCsv(row.triggers),
      row.riskAdjustmentsJson,
    ]);
  }

  async saveAlgorithmRow(row: ClinicianAlgorithmRow): Promise<void> {
    await this.upsertRow("Clinician_Algorithms", row.id, [
      row.id,
      row.system,
      row.title,
      String(row.isActive),
      String(row.version),
      joinCsv(row.tags),
      joinCsv(row.entryCriteria),
      joinCsv(row.requiredInputs),
      joinCsv(row.outputActions),
      joinCsv(row.notes),
    ]);
  }

  private async upsertRow(sheetName: string, id: string, values: string[]): Promise<void> {
    const lookup = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:A`,
    });

    const rows = lookup.data.values || [];
    const existingIndex = rows.findIndex(r => r[0] === id);

    if (existingIndex >= 1) {
      const rowNumber = existingIndex + 1;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [values] },
      });
    } else {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: "RAW",
        requestBody: { values: [values] },
      });
    }
  }
}
