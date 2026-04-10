import { useState } from "react";

interface ConditionData {
  id: string;
  field: string;
  value: string;
  [key: string]: unknown;
}

interface IfBlockEditorProps {
  node: ConditionData;
  update: (node: ConditionData) => void;
  onClose?: () => void;
}

export default function IfBlockEditor({ node, update, onClose }: IfBlockEditorProps) {
  const [field, setField] = useState(node.field ?? "");
  const [value, setValue] = useState(node.value ?? "");

  function save() {
    update({ ...node, field, value, if: { field, equals: value } });
  }

  return (
    <div
      className="bg-yellow-900 border border-yellow-700 p-4 rounded-xl shadow-xl w-72"
      data-testid="if-block-editor"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold text-sm">✏️ IF Condition</h4>
        {onClose && (
          <button
            onClick={onClose}
            data-testid="button-if-editor-close"
            className="text-yellow-400 hover:text-white text-xs"
          >
            ✕
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-yellow-300 text-xs block mb-0.5">Field</label>
          <input
            placeholder="e.g. risk"
            value={field}
            onChange={e => setField(e.target.value)}
            data-testid="input-if-field"
            className="w-full bg-yellow-800 border border-yellow-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="text-yellow-300 text-xs block mb-0.5">Equals</label>
          <input
            placeholder="e.g. high"
            value={value}
            onChange={e => setValue(e.target.value)}
            data-testid="input-if-equals"
            className="w-full bg-yellow-800 border border-yellow-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
          />
        </div>
      </div>

      <button
        onClick={save}
        data-testid="button-if-editor-save"
        className="mt-3 w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-white text-sm font-medium transition-colors"
      >
        ✅ Save Condition
      </button>

      <p className="text-yellow-400/60 text-[10px] mt-2 text-center">
        IF {field || "field"} == {value || "value"} → THEN / ELSE
      </p>
    </div>
  );
}
