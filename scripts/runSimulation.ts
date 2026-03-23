import { clinicalReasoning } from "../server/orchestrator/clinicalFusion";
import { runBrain } from "../server/brain/autonomousBrain";

async function run() {
  console.log("=== Clinical Reasoning Simulation ===\n");

  const reasoningResult = await clinicalReasoning({
    patientId: "sim-001",
    complaints: ["sore_throat", "fever"],
    vitals: { temperature: 38.5, heartRate: 94, oxygenSaturation: 98, systolicBp: 118, respRate: 18, urea: 5 },
    history: { age: 28, confusion: false, cough: false, tonsillarExudate: true, tenderNodes: true },
    embedding: [0.1, 0.2, 0.3],
  });

  console.log("Centor Score:", reasoningResult.scores.centor);
  console.log("CURB-65 Score:", reasoningResult.scores.curb65);
  console.log("Overall Risk:", reasoningResult.scores.overallRisk);
  console.log("Recommendation:", reasoningResult.recommendation);
  console.log("Requires Physician Review:", reasoningResult.requiresPhysicianReview);
  console.log("Similar Cases in Memory:", reasoningResult.similarCases.length);
  console.log("");

  console.log("=== Autonomous Brain Run ===\n");

  const brainResult = await runBrain({
    patientId: "sim-002",
    complaints: ["ear_pain", "fever"],
    vitals: { temperature: 38.1, heartRate: 88 },
    history: { age: 8 },
  });

  console.log("Status:", brainResult.status);
  console.log("Agent Prompt Used:", brainResult.agentPromptUsed.slice(0, 80) + "...");
  console.log("Review Decision:", brainResult.reviewDecision);
  if (brainResult.roboticResult) {
    console.log("Robotic Actions Triggered:", brainResult.roboticResult.roboticActionsTriggered);
  }
  console.log("Cycle Completed At:", brainResult.cycleCompletedAt);
}

run().catch(console.error);
