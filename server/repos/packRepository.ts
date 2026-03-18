import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";

export interface PackRepository {
  getSymptomRows(): Promise<SymptomPackRow[]>;
  getModifierRows(): Promise<ModifierPackRow[]>;
  getAlgorithmRows(): Promise<ClinicianAlgorithmRow[]>;

  saveSymptomRow(row: SymptomPackRow): Promise<void>;
  saveModifierRow(row: ModifierPackRow): Promise<void>;
  saveAlgorithmRow(row: ClinicianAlgorithmRow): Promise<void>;
}
