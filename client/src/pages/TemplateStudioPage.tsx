import { useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  category: string;
  currentVersionId?: string;
};

type Step = {
  id: string;
  name: string;
  action: string;
  selector?: string;
  value?: string;
  enabled: boolean;
};

export default function TemplateStudioPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const res = await fetch("/api/template-studio/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
  }

  async function openTemplate(templateId: string) {
    const res = await fetch(`/api/template-studio/templates/${templateId}`);
    const data = await res.json();
    setSelectedTemplate(data.template);
    const current =
      data.versions?.find((v: any) => v.versionId === data.template.currentVersionId) ??
      data.versions?.[data.versions.length - 1];
    setSelectedVersion(current);
    setSelectedStep(current?.steps?.[0] ?? null);
  }

  async function createTemplate() {
    if (!newName.trim()) return;
    const res = await fetch("/api/template-studio/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, category: newCategory }),
    });
    const data = await res.json();
    setCreating(false);
    setNewName("");
    await loadTemplates();
    openTemplate(data.template.id);
  }

  async function saveDraft() {
    if (!selectedTemplate || !selectedVersion) return;
    const updatedSteps = selectedStep
      ? selectedVersion.steps.map((s: any) => (s.id === selectedStep.id ? selectedStep : s))
      : selectedVersion.steps;
    const res = await fetch(`/api/template-studio/templates/${selectedTemplate.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: updatedSteps, changelog: "Auto-saved draft" }),
    });
    const data = await res.json();
    setSelectedVersion(data.version);
    setAlert("Draft saved");
    setTimeout(() => setAlert(null), 2000);
  }

  async function testStep(step: Step) {
    const res = await fetch(`/api/template-studio/templates/${selectedTemplate.id}/test-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
    });
    const data = await res.json();
    setAlert(data.result?.message || "Step tested");
    setTimeout(() => setAlert(null), 3000);
  }

  async function addStep() {
    if (!selectedVersion) return;
    const newStep: Step = {
      id: crypto.randomUUID(),
      name: "New Step",
      action: "click",
      enabled: true,
    };
    const updated = { ...selectedVersion, steps: [...(selectedVersion.steps || []), newStep] };
    setSelectedVersion(updated);
    setSelectedStep(newStep);
  }

  return (
    <div className="p-4 grid grid-cols-12 gap-4 h-[calc(100vh-4rem)] bg-slate-50">
      {alert && (
        <div className="col-span-12 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2 text-sm">
          {alert}
        </div>
      )}

      <div className="col-span-3 bg-white rounded-2xl shadow p-4 overflow-auto flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Template Studio</h2>
          <button
            data-testid="button-create-template"
            className="px-2 py-1 text-xs rounded-lg bg-blue-600 text-white"
            onClick={() => setCreating(true)}
          >
            + New
          </button>
        </div>

        {creating && (
          <div className="mb-3 space-y-2 border rounded-xl p-3 bg-slate-50">
            <input
              data-testid="input-template-name"
              className="w-full border rounded-lg p-2 text-sm"
              placeholder="Template name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <input
              data-testid="input-template-category"
              className="w-full border rounded-lg p-2 text-sm"
              placeholder="Category"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                data-testid="button-save-template"
                className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white"
                onClick={createTemplate}
              >
                Create
              </button>
              <button
                data-testid="button-cancel-template"
                className="px-3 py-1 text-xs rounded-lg border"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 flex-1 overflow-auto">
          {templates.map(t => (
            <button
              key={t.id}
              data-testid={`button-template-${t.id}`}
              className={`w-full text-left p-3 rounded-xl border hover:bg-slate-50 transition-colors ${
                selectedTemplate?.id === t.id ? "border-blue-500 bg-blue-50" : ""
              }`}
              onClick={() => openTemplate(t.id)}
            >
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-slate-500">{t.category}</div>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No templates yet</div>
          )}
        </div>
      </div>

      <div className="col-span-4 bg-white rounded-2xl shadow p-4 overflow-auto flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Steps</h3>
          {selectedVersion && (
            <button
              data-testid="button-add-step"
              className="px-2 py-1 text-xs rounded-lg bg-slate-100 border"
              onClick={addStep}
            >
              + Step
            </button>
          )}
        </div>
        {!selectedVersion && (
          <div className="text-slate-500 text-sm">Select a template</div>
        )}
        <div className="space-y-2 flex-1 overflow-auto">
          {selectedVersion?.steps?.map((step: Step, i: number) => (
            <div
              key={step.id}
              data-testid={`step-item-${i}`}
              className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                selectedStep?.id === step.id ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
              }`}
              onClick={() => setSelectedStep(step)}
            >
              <div className="font-medium text-sm">{step.name}</div>
              <div className="text-xs text-slate-500">
                {step.action} {step.enabled ? "• enabled" : "• disabled"}
              </div>
            </div>
          ))}
        </div>
        {selectedVersion && (
          <div className="text-xs text-slate-400 mt-2">
            v{selectedVersion.versionNumber} • {selectedVersion.status}
          </div>
        )}
      </div>

      <div className="col-span-5 bg-white rounded-2xl shadow p-4 overflow-auto">
        <h3 className="text-lg font-semibold mb-3">Step Editor</h3>
        {!selectedStep && <div className="text-slate-500 text-sm">Select a step to edit</div>}
        {selectedStep && (
          <div className="space-y-3">
            <label className="block">
              <div className="text-sm font-medium mb-1">Name</div>
              <input
                data-testid="input-step-name"
                className="w-full border rounded-lg p-2 text-sm"
                value={selectedStep.name}
                onChange={e => setSelectedStep({ ...selectedStep, name: e.target.value })}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium mb-1">Action</div>
              <select
                data-testid="select-step-action"
                className="w-full border rounded-lg p-2 text-sm"
                value={selectedStep.action}
                onChange={e => setSelectedStep({ ...selectedStep, action: e.target.value })}
              >
                {["goto","click","type","select","checkbox","waitFor","extract","assert","screenshot"].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-sm font-medium mb-1">Selector</div>
              <textarea
                data-testid="input-step-selector"
                className="w-full border rounded-lg p-2 text-sm min-h-[70px]"
                value={selectedStep.selector || ""}
                onChange={e => setSelectedStep({ ...selectedStep, selector: e.target.value })}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium mb-1">Value</div>
              <textarea
                data-testid="input-step-value"
                className="w-full border rounded-lg p-2 text-sm min-h-[70px]"
                value={selectedStep.value || ""}
                onChange={e => setSelectedStep({ ...selectedStep, value: e.target.value })}
              />
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                data-testid="checkbox-step-enabled"
                type="checkbox"
                checked={selectedStep.enabled}
                onChange={e => setSelectedStep({ ...selectedStep, enabled: e.target.checked })}
              />
              <span className="text-sm">Enabled</span>
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                data-testid="button-test-step"
                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm"
                onClick={() => testStep(selectedStep)}
              >
                Test Step
              </button>
              <button
                data-testid="button-save-draft"
                className="px-3 py-2 rounded-xl border text-sm"
                onClick={saveDraft}
              >
                Save Draft
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
