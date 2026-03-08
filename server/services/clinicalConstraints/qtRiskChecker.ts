export interface QTRiskResult {
  riskLevel: "low" | "moderate" | "high";
  qtcMs?: number;
  warnings: string[];
}

const QT_PROLONGING_DRUGS = new Set([
  "azithromycin", "erythromycin", "clarithromycin", "fluoroquinolone",
  "ondansetron", "methadone", "haloperidol", "amiodarone",
]);

export function checkQTRisk(medication: string, currentMedications: string[], qtcMs?: number): QTRiskResult {
  const warnings: string[] = [];
  const medLower = medication.toLowerCase();

  const proposedQT = QT_PROLONGING_DRUGS.has(medLower);
  const existingQT = currentMedications.filter((m) => QT_PROLONGING_DRUGS.has(m.toLowerCase()));

  if (proposedQT && existingQT.length > 0) {
    warnings.push(`Multiple QT-prolonging agents: ${medication} + ${existingQT.join(", ")}`);
  }

  if (qtcMs !== undefined && qtcMs > 500) warnings.push(`QTc ${qtcMs}ms exceeds 500ms threshold`);
  else if (qtcMs !== undefined && qtcMs > 470) warnings.push(`QTc ${qtcMs}ms is borderline prolonged`);

  let riskLevel: QTRiskResult["riskLevel"] = "low";
  if (warnings.length >= 2 || (qtcMs !== undefined && qtcMs > 500)) riskLevel = "high";
  else if (warnings.length >= 1) riskLevel = "moderate";

  return { riskLevel, qtcMs, warnings };
}
