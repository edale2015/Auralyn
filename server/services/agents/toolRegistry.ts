export interface AgentTool {
  id: string;
  name: string;
  description: string;
  category: "clinical" | "data" | "communication" | "analysis";
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

const tools = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void {
  tools.set(tool.id, tool);
}

export function getTool(id: string): AgentTool | undefined {
  return tools.get(id);
}

export function listTools(): AgentTool[] {
  return Array.from(tools.values());
}

export async function executeTool(id: string, params: Record<string, unknown>): Promise<unknown> {
  const tool = tools.get(id);
  if (!tool) throw new Error(`Tool not found: ${id}`);
  return tool.handler(params);
}
