export interface McpToolCall {
  name:  string;
  input: Record<string, unknown>;
}

export interface McpToolResult {
  tool:    string;
  result:  unknown;
  error?:  string;
  source:  string;
}

async function fetchEHR(patientId: string): Promise<unknown> {
  return {
    patientId,
    source:          "ehr_stub",
    allergies:       [],
    medications:     [],
    conditions:      [],
    lastVisit:       null,
    retrievedAt:     new Date().toISOString(),
  };
}

async function fetchLabs(patientId: string): Promise<unknown> {
  return {
    patientId,
    source:          "lab_stub",
    results:         [],
    pendingOrders:   [],
    retrievedAt:     new Date().toISOString(),
  };
}

async function fetchMedications(patientId: string): Promise<unknown> {
  return {
    patientId,
    source:          "rx_stub",
    currentMeds:     [],
    interactions:    [],
    retrievedAt:     new Date().toISOString(),
  };
}

export async function callExternalTool(
  name: string,
  input: Record<string, unknown>
): Promise<McpToolResult> {
  try {
    switch (name) {
      case "ehr_lookup":
        return { tool: name, result: await fetchEHR(input.patientId as string), source: "ehr" };

      case "lab_results":
        return { tool: name, result: await fetchLabs(input.patientId as string), source: "lab" };

      case "medication_check":
        return { tool: name, result: await fetchMedications(input.patientId as string), source: "rx" };

      case "rapid_strep_result":
        return {
          tool:   name,
          result: { positive: Math.random() > 0.5, sensitivity: 0.86, specificity: 0.95 },
          source: "rapid_test_stub",
        };

      case "imaging_order":
        return {
          tool:   name,
          result: { orderId: `img-${Date.now()}`, status: "pending", modality: input.modality ?? "xr" },
          source: "imaging_stub",
        };

      default:
        return {
          tool:   name,
          result: null,
          error:  `Unknown MCP tool: ${name}`,
          source: "unknown",
        };
    }
  } catch (err: any) {
    return {
      tool:   name,
      result: null,
      error:  err?.message ?? "MCP tool call failed",
      source: "error",
    };
  }
}

export async function batchMcpCalls(calls: McpToolCall[]): Promise<McpToolResult[]> {
  return Promise.all(calls.map((c) => callExternalTool(c.name, c.input)));
}
