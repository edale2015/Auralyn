import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";
import { PackAuditLogRow } from "../../shared/packAuditRows";

export interface PackRepository {
  getSymptomRows(): Promise<SymptomPackRow[]>;
  getModifierRows(): Promise<ModifierPackRow[]>;
  getAlgorithmRows(): Promise<ClinicianAlgorithmRow[]>;
  getQuestionRows(): Promise<PackQuestionRow[]>;
  getAuditRows(limit?: number): Promise<PackAuditLogRow[]>;

  saveSymptomRow(row: SymptomPackRow): Promise<void>;
  saveModifierRow(row: ModifierPackRow): Promise<void>;
  saveAlgorithmRow(row: ClinicianAlgorithmRow): Promise<void>;
  saveQuestionRow(row: PackQuestionRow): Promise<void>;
  appendAuditRow(row: PackAuditLogRow): Promise<void>;
}
