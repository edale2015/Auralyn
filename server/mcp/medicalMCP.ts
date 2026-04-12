export interface MCPContext {
  patientId?: string;
  complaint?: string;
  userId?:    string;
  auditId?:   string;
  traceId?:   string;
}

export interface MCPTool {
  name:        string;
  description: string;
  execute:     (input: any, context: MCPContext) => Promise<any>;
}

class MedicalMCPRegistry {
  private readonly tools = new Map<string, MCPTool>();

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    console.log(`[MedicalMCP] registered tool: ${tool.name}`);
  }

  get(name: string): MCPTool {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`MedicalMCP tool not found: ${name}`);
    return tool;
  }

  async execute(name: string, input: any, context: MCPContext): Promise<any> {
    const tool = this.get(name);
    console.log(`[MedicalMCP] executing: ${name}`);
    return tool.execute(input, context);
  }

  listTools(): Array<{ name: string; description: string }> {
    return [...this.tools.values()].map((t) => ({
      name:        t.name,
      description: t.description,
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const medicalMCP = new MedicalMCPRegistry();
