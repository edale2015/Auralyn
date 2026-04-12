export interface ToolBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  name: string;
  content: unknown;
  error?: string;
  durationMs: number;
}

type ToolDispatcher = (name: string, input: Record<string, unknown>) => Promise<unknown>;

const _defaultDispatcher: ToolDispatcher = async (name, input) => {
  return { tool: name, input, result: "dispatched", timestamp: new Date().toISOString() };
};

export async function runParallelTools(
  blocks: ToolBlock[],
  dispatcher: ToolDispatcher = _defaultDispatcher
): Promise<ToolResult[]> {
  return Promise.all(
    blocks.map(async (b) => {
      const start = Date.now();
      try {
        const content = await dispatcher(b.name, b.input);
        return {
          tool_use_id: b.id,
          name:        b.name,
          content,
          durationMs:  Date.now() - start,
        };
      } catch (err: any) {
        return {
          tool_use_id: b.id,
          name:        b.name,
          content:     null,
          error:       err?.message ?? "Tool dispatch failed",
          durationMs:  Date.now() - start,
        };
      }
    })
  );
}

export function buildToolBlock(
  name: string,
  input: Record<string, unknown>,
  id?: string
): ToolBlock {
  return { id: id ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, input };
}
