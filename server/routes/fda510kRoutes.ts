import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateFDA510kNarrative } from "../compliance/fda510kGenerator";

const router = Router();

router.get("/narrative", requireRole(["admin"]), (_req, res) => {
  const narrative = generateFDA510kNarrative();
  res.json(narrative);
});

router.get("/narrative/text", requireRole(["admin"]), (_req, res) => {
  const narrative = generateFDA510kNarrative();
  let text = `FDA 510(k) PRE-SUBMISSION NARRATIVE\n`;
  text += `Generated: ${narrative.generatedAt}\n`;
  text += `Model Version: ${narrative.modelVersion}\n`;
  text += `${"=".repeat(80)}\n\n`;

  for (const section of narrative.sections) {
    text += `SECTION ${section.sectionNumber}: ${section.title.toUpperCase()}\n`;
    text += `${"-".repeat(60)}\n`;
    text += `${section.content}\n\n`;
  }

  text += `${"=".repeat(80)}\n`;
  text += `METRICS SUMMARY\n`;
  text += `Total Validation Cases: ${narrative.metrics.totalValidationCases}\n`;
  text += `Accuracy: ${narrative.metrics.accuracy}%\n`;
  text += `Avg Confidence: ${narrative.metrics.avgConfidence}\n`;
  text += `Avg Latency: ${narrative.metrics.avgLatencyMs}ms\n`;
  text += `Scoring Systems: ${narrative.metrics.scoringSystemCount}\n`;
  text += `ICD-10 Mappings: ${narrative.metrics.icd10MappingCount}\n`;

  res.setHeader("Content-Type", "text/plain");
  res.send(text);
});

export default router;
