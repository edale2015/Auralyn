import { getStep } from "./registry";

export interface BranchNode {
  id: string;
  name: string;
  next?: string;
  if?: {
    field: string;
    equals: unknown;
    then: string;
    else?: string;
  };
}

export async function runBranchWorkflow(
  nodes: BranchNode[],
  startId: string,
  input: Record<string, any>
): Promise<Record<string, any>> {
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  let current: BranchNode | undefined = map[startId];
  let ctx: Record<string, any> = { ...input };

  while (current) {
    const fn = getStep(current.name);
    if (!fn) throw new Error(`Missing step: ${current.name}`);
    ctx = await fn(ctx);

    if (current.if) {
      const val = ctx[current.if.field];
      const nextId = val === current.if.equals ? current.if.then : current.if.else;
      current = nextId ? map[nextId] : undefined;
    } else {
      current = current.next ? map[current.next] : undefined;
    }
  }

  return ctx;
}
