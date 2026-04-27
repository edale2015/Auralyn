import { runLabGoldenCaseValidation } from "./goldenCaseValidator";

async function main() {
  const result = await runLabGoldenCaseValidation();
  console.log("Passed:", result.passed);
  console.log(`SOFA accurate: ${result.sofaAccurate}/${result.totalCases}`);
  console.log(`Interp correct: ${result.interpretCorrect}/${result.totalCases}`);
  console.log(`Trend correct: ${result.trendCorrect}/${result.totalCases}`);
  console.log("Safety mismatches:", result.safetyMismatches);
  for (const d of result.details) {
    const st = d.safetyMismatch ? "[SAFETY]" : d.sofaMatch && d.interpretationMatch ? "[PASS]" : "[WARN]";
    console.log(st, d.caseId, "SOFA", d.sofaActual, "exp", d.sofaExpected, "|", d.interpretationActual, "| trend:", d.trendActual);
  }
}
main();
