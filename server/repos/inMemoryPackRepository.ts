import { PackRepository } from "./packRepository";
import {
  symptomPackRows,
  modifierPackRows,
  clinicianAlgorithmRows,
} from "../config/packRows.seed";
import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";

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
}
