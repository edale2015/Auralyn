import { memo } from "react";
import { Handle, Position } from "reactflow";

interface ConditionData {
  condition: { field: string; equals: string };
  onChange?: (data: ConditionData) => void;
}

function ConditionNode({ data }: { data: ConditionData }) {
  const { field = "", equals = "" } = data.condition ?? {};

  const update = (patch: Partial<{ field: string; equals: string }>) => {
    data.onChange?.({
      ...data,
      condition: { ...data.condition, ...patch },
    });
  };

  return (
    <div
      className="bg-yellow-900 text-white p-3 rounded-lg border border-yellow-500 min-w-[170px]"
      data-testid="condition-node"
    >
      <Handle type="target" position={Position.Top} />
      <p className="text-xs font-bold text-yellow-300 mb-2 uppercase tracking-wide">IF condition</p>

      <div className="space-y-1.5">
        <input
          placeholder="field (e.g. risk)"
          defaultValue={field}
          onChange={e => update({ field: e.target.value })}
          data-testid="input-condition-field"
          className="w-full bg-yellow-800 border border-yellow-700 rounded px-2 py-1 text-xs text-white placeholder-yellow-400/60 focus:outline-none"
        />
        <input
          placeholder="equals (e.g. high)"
          defaultValue={equals}
          onChange={e => update({ equals: e.target.value })}
          data-testid="input-condition-equals"
          className="w-full bg-yellow-800 border border-yellow-700 rounded px-2 py-1 text-xs text-white placeholder-yellow-400/60 focus:outline-none"
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-yellow-300">
        <span>✅ THEN</span>
        <span>❌ ELSE</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="then" style={{ left: "25%" }} />
      <Handle type="source" position={Position.Bottom} id="else" style={{ left: "75%" }} />
    </div>
  );
}

export default memo(ConditionNode);
