import { useEffect, useState } from "react";

interface VariableDef {
  key: string;
  label: string;
  sourceType: string;
  required: boolean;
  defaultValue?: string;
  secretRef?: string;
}

export default function VariableBindingsPanel({ variables }: { variables: VariableDef[] }) {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [bindings, setBindings] = useState<Record<string, any>>({});
  const [resolution, setResolution] = useState<any>(null);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [addingSecret, setAddingSecret] = useState(false);

  useEffect(() => {
    loadSecrets();
  }, []);

  async function loadSecrets() {
    const res = await fetch("/api/template-vars/secrets");
    const data = await res.json();
    setSecrets(data.secrets || []);
  }

  async function addSecret() {
    if (!newSecretName.trim() || !newSecretValue.trim()) return;
    await fetch("/api/template-vars/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSecretName, value: newSecretValue }),
    });
    setNewSecretName("");
    setNewSecretValue("");
    setAddingSecret(false);
    loadSecrets();
  }

  async function testResolve() {
    const defs = variables;
    const runtimeBindings = Object.entries(bindings).map(([key, value]) => ({ key, ...value }));
    const res = await fetch("/api/template-vars/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definitions: defs, bindings: runtimeBindings }),
    });
    const data = await res.json();
    setResolution(data);
  }

  function setBinding(key: string, field: string, val: string) {
    setBindings(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: val },
    }));
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Variable Bindings</h3>
        <button
          data-testid="button-add-secret"
          className="text-xs px-2 py-1 rounded-lg bg-slate-100 border"
          onClick={() => setAddingSecret(v => !v)}
        >
          + Secret
        </button>
      </div>

      {addingSecret && (
        <div className="border rounded-xl p-3 bg-slate-50 space-y-2">
          <input
            data-testid="input-secret-name"
            className="border rounded-lg p-2 w-full text-sm"
            placeholder="Secret name"
            value={newSecretName}
            onChange={e => setNewSecretName(e.target.value)}
          />
          <input
            data-testid="input-secret-value"
            type="password"
            className="border rounded-lg p-2 w-full text-sm"
            placeholder="Secret value"
            value={newSecretValue}
            onChange={e => setNewSecretValue(e.target.value)}
          />
          <button
            data-testid="button-save-secret"
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm"
            onClick={addSecret}
          >
            Save Secret
          </button>
        </div>
      )}

      {variables.length === 0 && (
        <div className="text-slate-400 text-sm">No variables defined for this template</div>
      )}

      {variables.map(v => (
        <div key={v.key} className="border rounded-xl p-3">
          <div className="font-medium text-sm">{v.label || v.key}</div>
          <div className="text-xs text-slate-500 mb-2">
            {v.key} • {v.sourceType} • {v.required ? "required" : "optional"}
          </div>

          <select
            data-testid={`select-source-${v.key}`}
            className="border rounded-lg p-2 w-full text-sm mb-2"
            value={bindings[v.key]?.sourceType || "runtime"}
            onChange={e => setBinding(v.key, "sourceType", e.target.value)}
          >
            <option value="runtime">Runtime</option>
            <option value="secret">Secret</option>
            <option value="static">Static</option>
          </select>

          {bindings[v.key]?.sourceType !== "secret" ? (
            <input
              data-testid={`input-value-${v.key}`}
              className="border rounded-lg p-2 w-full text-sm"
              placeholder={v.defaultValue || "Enter value"}
              value={bindings[v.key]?.value || ""}
              onChange={e => setBinding(v.key, "value", e.target.value)}
            />
          ) : (
            <select
              data-testid={`select-secret-${v.key}`}
              className="border rounded-lg p-2 w-full text-sm"
              value={bindings[v.key]?.secretRef || ""}
              onChange={e => setBinding(v.key, "secretRef", e.target.value)}
            >
              <option value="">Select secret</option>
              {secrets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      ))}

      {variables.length > 0 && (
        <button
          data-testid="button-test-resolve"
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm w-full"
          onClick={testResolve}
        >
          Test Variable Resolution
        </button>
      )}

      {resolution && (
        <pre className="bg-slate-100 rounded-xl p-3 text-xs overflow-auto max-h-48">
          {JSON.stringify(resolution, null, 2)}
        </pre>
      )}
    </div>
  );
}
