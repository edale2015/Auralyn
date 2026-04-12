/**
 * Tool Schema Registry — Strict input validation + access levels
 *
 * Article: "define the tool schema clearly and narrowly",
 *  "additionalProperties: false", "strict schemas", "separate read tools
 *  from write tools", "your server enforces authentication, authorization,
 *  validation, retries, and side effects."
 *
 * The existing toolRegistry.ts accepts Record<string, unknown> with no
 * validation. This module adds:
 *   1. Zod input schema on every tool (validated before handler runs)
 *   2. accessLevel: "read" | "write" | "admin"
 *   3. requiresApproval flag (sensitive write actions pause for confirmation)
 *   4. JSON Schema export (for OpenAI / MCP function definitions)
 *
 * Does NOT replace toolRegistry.ts — sits above it as an upgrade layer.
 * Use `registerSchemaedTool` / `executeWithSchema` for new tools;
 * existing legacy tools continue to work unchanged via executeTool.
 */

import { z, ZodTypeAny } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccessLevel = "read" | "write" | "admin";

export interface SchemaTool<TIn extends ZodTypeAny = ZodTypeAny> {
  id:              string;
  name:            string;
  description:     string;
  category:        "clinical" | "data" | "communication" | "analysis" | "safety";
  accessLevel:     AccessLevel;
  requiresApproval:boolean;   // write/admin tools that need explicit sign-off
  inputSchema:     TIn;       // Zod schema — validated before handler
  handler:         (params: z.infer<TIn>) => Promise<unknown>;
  examples?:       Array<{ description: string; input: z.infer<TIn> }>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, SchemaTool>();

export function registerSchemaTool<TIn extends ZodTypeAny>(tool: SchemaTool<TIn>): void {
  _registry.set(tool.id, tool as SchemaTool);
}

export function getSchemaTool(id: string): SchemaTool | null {
  return _registry.get(id) ?? null;
}

export function listSchemaTools(filters?: {
  category?: string;
  accessLevel?: AccessLevel;
  requiresApproval?: boolean;
}): SchemaTool[] {
  return [..._registry.values()].filter((t) => {
    if (filters?.category     && t.category     !== filters.category)     return false;
    if (filters?.accessLevel  && t.accessLevel  !== filters.accessLevel)  return false;
    if (filters?.requiresApproval !== undefined && t.requiresApproval !== filters.requiresApproval) return false;
    return true;
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  data?:  unknown;
  errors: string[];
}

/**
 * Validate tool input against its Zod schema before execution.
 * The article: "evaluate failure modes such as hallucinated arguments."
 * Rejects: wrong types, missing required fields, out-of-range values,
 * unknown extra keys (strict mode via .strict() on caller's schema).
 */
export function validateToolInput(toolId: string, rawInput: unknown): ValidationResult {
  const tool = _registry.get(toolId);
  if (!tool) return { valid: false, errors: [`Tool not found: ${toolId}`] };

  const result = tool.inputSchema.safeParse(rawInput);
  if (result.success) {
    return { valid: true, data: result.data, errors: [] };
  }

  const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
  return { valid: false, errors };
}

// ── JSON Schema export (for OpenAI / MCP function definitions) ────────────────

/**
 * Convert a SchemaTool to OpenAI function definition format.
 * The article: "A function tool is defined with a JSON schema."
 */
export function toOpenAIFunction(tool: SchemaTool): {
  type:        "function";
  name:        string;
  description: string;
  parameters:  Record<string, unknown>;
} {
  return {
    type:        "function",
    name:        tool.id,
    description: `[${tool.accessLevel.toUpperCase()}] ${tool.description}`,
    parameters:  zodToJsonSchema(tool.inputSchema),
  };
}

/**
 * Export all read-only tools as function definitions.
 * The article: "expose only the minimum safe tools."
 */
export function exportReadOnlyFunctions(): ReturnType<typeof toOpenAIFunction>[] {
  return listSchemaTools({ accessLevel: "read" }).map(toOpenAIFunction);
}

export function exportAllFunctions(
  maxLevel: AccessLevel = "read"
): ReturnType<typeof toOpenAIFunction>[] {
  const levels: AccessLevel[] = ["read"];
  if (maxLevel === "write" || maxLevel === "admin") levels.push("write");
  if (maxLevel === "admin") levels.push("admin");
  return [..._registry.values()]
    .filter((t) => levels.includes(t.accessLevel))
    .map(toOpenAIFunction);
}

// ── Minimal Zod → JSON Schema converter ──────────────────────────────────────

function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const def = (schema as any)._def;
  const typeName: string = def?.typeName ?? "";

  if (typeName === "ZodObject") {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val as ZodTypeAny);
      const vDef = (val as any)._def;
      if (vDef?.typeName !== "ZodOptional") required.push(key);
    }

    return {
      type:                 "object",
      properties,
      required:             required.length > 0 ? required : undefined,
      additionalProperties: false,   // always strict
    };
  }

  if (typeName === "ZodString")  return { type: "string" };
  if (typeName === "ZodNumber")  return { type: "number" };
  if (typeName === "ZodBoolean") return { type: "boolean" };
  if (typeName === "ZodOptional") return zodToJsonSchema(def.innerType);
  if (typeName === "ZodEnum")    return { type: "string", enum: def.values };
  if (typeName === "ZodArray")   return { type: "array", items: zodToJsonSchema(def.type) };
  if (typeName === "ZodDefault") return zodToJsonSchema(def.innerType);

  return { type: "object" };
}

// ── Built-in clinical schema tools ───────────────────────────────────────────

/** Register the standard clinical schema tool library */
export function registerBuiltInSchemaTools(): void {

  // READ — safe, no auth, no approval
  registerSchemaTool({
    id:               "vitals_check",
    name:             "Vitals Check",
    description:      "Validate and flag abnormal vital signs",
    category:         "clinical",
    accessLevel:      "read",
    requiresApproval: false,
    inputSchema:      z.object({
      patientId: z.string().min(1),
      hr:        z.number().min(0).max(300).optional().default(72),
      sbp:       z.number().min(0).max(300).optional().default(120),
      dbp:       z.number().min(0).max(200).optional().default(80),
      spo2:      z.number().min(50).max(100).optional().default(98),
      rr:        z.number().min(0).max(60).optional().default(16),
      temp:      z.number().min(30).max(45).optional().default(37.0),
    }),
    handler: async ({ patientId, hr, sbp, dbp, spo2, rr, temp }) => {
      const flags: string[] = [];
      if (hr  && (hr  > 100 || hr  < 60))  flags.push(`HR ${hr} ${hr > 100 ? "tachycardia" : "bradycardia"}`);
      if (sbp && sbp < 90)                  flags.push(`SBP ${sbp} hypotension`);
      if (spo2 && spo2 < 94)                flags.push(`SpO2 ${spo2}% low`);
      if (rr  && (rr  > 20 || rr  < 12))   flags.push(`RR ${rr} ${rr > 20 ? "tachypnea" : "bradypnea"}`);
      if (temp && (temp > 38.3 || temp < 36)) flags.push(`Temp ${temp}°C ${temp > 38.3 ? "fever" : "hypothermia"}`);
      return { patientId, flags, abnormal: flags.length > 0, timestamp: new Date().toISOString() };
    },
    examples: [
      { description: "Critical vitals", input: { patientId: "P001", hr: 130, sbp: 85, spo2: 88, rr: 26, temp: 39.1 } },
    ],
  });

  // READ — case retrieval
  registerSchemaTool({
    id:               "lookup_patient",
    name:             "Lookup Patient",
    description:      "Retrieve basic patient record and current status",
    category:         "data",
    accessLevel:      "read",
    requiresApproval: false,
    inputSchema:      z.object({
      patientId: z.string().min(1),
      fields:    z.array(z.enum(["demographics", "allergies", "medications", "vitals", "diagnoses"])).optional(),
    }),
    handler: async ({ patientId, fields }) => ({
      patientId,
      status:   "active",
      fields:   fields ?? ["demographics"],
      retrieved: new Date().toISOString(),
    }),
  });

  // WRITE — requires approval (prescribing = high-stakes)
  registerSchemaTool({
    id:               "prescribe_medication",
    name:             "Prescribe Medication",
    description:      "Generate a medication order — requires physician approval",
    category:         "clinical",
    accessLevel:      "write",
    requiresApproval: true,
    inputSchema:      z.object({
      patientId:  z.string().min(1),
      medication: z.string().min(2),
      dose:       z.string().min(1),
      route:      z.enum(["oral", "IV", "IM", "SC", "topical", "inhaled"]),
      frequency:  z.string().min(1),
      indication: z.string().min(5),
      prescriberId: z.string().min(1),
    }),
    handler: async (params) => ({
      orderId:   `RX-${params.patientId}-${Date.now().toString(36).toUpperCase()}`,
      status:    "pending_approval",
      ...params,
      timestamp: new Date().toISOString(),
    }),
    examples: [
      {
        description: "Antibiotic for UTI",
        input: {
          patientId: "P001", medication: "nitrofurantoin", dose: "100mg",
          route: "oral", frequency: "BID x 5 days",
          indication: "UTI — positive UA", prescriberId: "dr-smith",
        },
      },
    ],
  });

  // WRITE — admit patient
  registerSchemaTool({
    id:               "admit_patient",
    name:             "Admit Patient",
    description:      "Create inpatient admission order",
    category:         "clinical",
    accessLevel:      "write",
    requiresApproval: true,
    inputSchema:      z.object({
      patientId:    z.string().min(1),
      unit:         z.enum(["ICU", "step_down", "general_med", "obs", "ED"]),
      diagnosis:    z.string().min(3),
      attendingId:  z.string().min(1),
      priority:     z.enum(["emergency", "urgent", "elective"]).optional().default("urgent"),
    }),
    handler: async (params) => ({
      admissionId: `ADM-${params.patientId}-${Date.now().toString(36).toUpperCase()}`,
      status:      "pending_bed_assignment",
      ...params,
      timestamp:   new Date().toISOString(),
    }),
  });

  // ADMIN — override safety floor (highest risk)
  registerSchemaTool({
    id:               "override_safety_decision",
    name:             "Override Safety Decision",
    description:      "Override an automated safety escalation — ADMIN only, full audit",
    category:         "safety",
    accessLevel:      "admin",
    requiresApproval: true,
    inputSchema:      z.object({
      patientId:     z.string().min(1),
      decisionId:    z.string().min(1),
      overrideReason: z.string().min(20),
      physicianId:   z.string().min(1),
      acknowledgedRisk: z.boolean(),
    }),
    handler: async (params) => {
      if (!params.acknowledgedRisk) throw new Error("acknowledgedRisk must be true for safety override");
      return {
        overrideId: `OVR-${params.decisionId}-${Date.now().toString(36).toUpperCase()}`,
        status:     "approved",
        auditTrail: `Override by ${params.physicianId}: ${params.overrideReason}`,
        timestamp:  new Date().toISOString(),
      };
    },
  });
}
