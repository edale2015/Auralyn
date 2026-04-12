/**
 * LangChain Tool Definitions — clinical function-calling tools
 * Each tool wraps a live engine endpoint so the LLM can invoke them.
 */

import { tool } from "@langchain/core/tools";
import { z }    from "zod";
import { generateInterventions } from "../../engines/interventionEngine";
import { computeNEWS2 }          from "../../engines/interventionEngine";

export const news2Tool = tool(
  async ({ hr, spo2, temp, systolicBP, rr }) => {
    const score  = computeNEWS2({ hr, spo2, temp, systolicBP, rr });
    const risk   = score >= 7 ? "critical" : score >= 5 ? "high" : score >= 1 ? "medium" : "low";
    return JSON.stringify({ newsScore: score, riskLevel: risk });
  },
  {
    name:        "compute_news2",
    description: "Compute the National Early Warning Score 2 (NEWS2) from vital signs. Returns score + risk level.",
    schema: z.object({
      hr:         z.number().describe("Heart rate in bpm"),
      spo2:       z.number().describe("Oxygen saturation %"),
      temp:       z.number().describe("Temperature in °F"),
      systolicBP: z.number().describe("Systolic blood pressure mmHg"),
      rr:         z.number().optional().describe("Respiratory rate breaths/min"),
    }),
  }
);

export const interventionTool = tool(
  async ({ hr, spo2, temp, systolicBP }) => {
    const result = generateInterventions({ hr, spo2, temp, systolicBP });
    return JSON.stringify({
      riskLevel:      result.riskLevel,
      sepsisCriteria: result.sepsisCriteria,
      topInterventions: result.interventions.slice(0, 3).map((i) => ({
        type:   i.type,
        action: i.action,
      })),
    });
  },
  {
    name:        "generate_interventions",
    description: "Generate clinical interventions (labs, meds, escalations) from vital signs.",
    schema: z.object({
      hr:         z.number(),
      spo2:       z.number(),
      temp:       z.number(),
      systolicBP: z.number(),
    }),
  }
);

export const clinicalTools = [news2Tool, interventionTool];
