import { google } from "googleapis";
import { PackRepository } from "./packRepository";
import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";
import { PackAuditLogRow } from "../../shared/packAuditRows";

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

  async getQuestionRows(): Promise<PackQuestionRow[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "Pack_Questions!A2:K",
    });

    const rows = res.data.values || [];

    return rows.map((r): PackQuestionRow => ({
      id: r[0] || "",
      packId: r[1] || "",
      questionId: r[2] || "",
      prompt: r[3] || "",
      type: (r[4] || "text") as any,
      priority: Number(r[5] || 0),
      required: String(r[6]).toLowerCase() === "true",
      optionsJson: r[7] || "",
      helpText: r[8] || "",
      isActive: String(r[9]).toLowerCase() === "true",
      version: Number(r[10] || 1),
    }));
  }

  async getAuditRows(limit = 200): Promise<PackAuditLogRow[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "Pack_Audit_Log!A2:L",
    });

    const rows = (res.data.values || []).slice(-limit).reverse();

    return rows.map((r): PackAuditLogRow => ({
      id: r[0] || "",
      entityType: (r[1] || "symptom_pack") as any,
      entityId: r[2] || "",
      action: (r[3] || "update") as any,
      actorId: r[4] || "",
      actorName: r[5] || "",
      at: r[6] || "",
      beforeJson: r[7] || "",
      afterJson: r[8] || "",
      validationOk: String(r[9]).toLowerCase() === "true",
      validationIssuesJson: r[10] || "",
      notes: r[11] || "",
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

  async saveQuestionRow(row: PackQuestionRow): Promise<void> {
    await this.upsertRow("Pack_Questions", row.id, [
      row.id,
      row.packId,
      row.questionId,
      row.prompt,
      row.type,
      String(row.priority),
      String(row.required),
      row.optionsJson || "",
      row.helpText || "",
      String(row.isActive),
      String(row.version),
    ]);
  }

  async appendAuditRow(row: PackAuditLogRow): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "Pack_Audit_Log!A:L",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          row.id,
          row.entityType,
          row.entityId,
          row.action,
          row.actorId,
          row.actorName || "",
          row.at,
          row.beforeJson || "",
          row.afterJson || "",
          String(Boolean(row.validationOk)),
          row.validationIssuesJson || "",
          row.notes || "",
        ]],
      },
    });
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
