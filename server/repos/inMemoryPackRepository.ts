import { PackRepository } from "./packRepository";
import {
  symptomPackRows,
  modifierPackRows,
  clinicianAlgorithmRows,
} from "../config/packRows.seed";
import { packQuestionRows } from "../config/packQuestions.seed";
import { packAuditLogRows } from "../config/packAuditLog.seed";
import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";
import { PackAuditLogRow } from "../../shared/packAuditRows";

export class InMemoryPackRepository implements PackRepository {
  async getSymptomRows(): Promise<SymptomPackRow[]> {
    return [...symptomPackRows];
  }

  async getModifierRows(): Promise<ModifierPackRow[]> {
    return [...modifierPackRows];
  }

  async getAlgorithmRows(): Promise<ClinicianAlgorithmRow[]> {
    return [...clinicianAlgorithmRows];
  }

  async getQuestionRows(): Promise<PackQuestionRow[]> {
    return [...packQuestionRows];
  }

  async getAuditRows(limit = 200): Promise<PackAuditLogRow[]> {
    return [...packAuditLogRows].slice(-limit).reverse();
  }

  async saveSymptomRow(row: SymptomPackRow): Promise<void> {
    const idx = symptomPackRows.findIndex(x => x.id === row.id);
    if (idx >= 0) symptomPackRows[idx] = row;
    else symptomPackRows.push(row);
  }

  async saveModifierRow(row: ModifierPackRow): Promise<void> {
    const idx = modifierPackRows.findIndex(x => x.id === row.id);
    if (idx >= 0) modifierPackRows[idx] = row;
    else modifierPackRows.push(row);
  }

  async saveAlgorithmRow(row: ClinicianAlgorithmRow): Promise<void> {
    const idx = clinicianAlgorithmRows.findIndex(x => x.id === row.id);
    if (idx >= 0) clinicianAlgorithmRows[idx] = row;
    else clinicianAlgorithmRows.push(row);
  }

  async saveQuestionRow(row: PackQuestionRow): Promise<void> {
    const idx = packQuestionRows.findIndex(x => x.id === row.id);
    if (idx >= 0) packQuestionRows[idx] = row;
    else packQuestionRows.push(row);
  }

  async appendAuditRow(row: PackAuditLogRow): Promise<void> {
    packAuditLogRows.push(row);
  }
}
