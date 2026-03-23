import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function AutomationRecorder() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/automation-recorder/templates"],
  });

  const record = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/automation-recorder/record", { url, templateKey, name }),
    onSuccess: async (res) => {
      const json = await res.json();
      setResult(json);
      qc.invalidateQueries({ queryKey: ["/api/automation-recorder/templates"] });
      setUrl("");
      setTemplateKey("");
      setName("");
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to record template");
    },
  });

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-recorder-title">Automation Recorder</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Point to a live URL and the recorder will inspect the page and generate a reusable automation template.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-medium">Record a New Template</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Target URL</label>
            <input
              data-testid="input-recorder-url"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="https://example.gov/form"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Template Key</label>
              <input
                data-testid="input-recorder-key"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="my-form-key"
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Template Name</label>
              <input
                data-testid="input-recorder-name"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="My Form Template"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          data-testid="button-record-template"
          className="rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => record.mutate()}
          disabled={record.isPending || !url || !templateKey || !name}
        >
          {record.isPending ? "Recording..." : "Record Template"}
        </button>
      </section>

      {result && (
        <section className="rounded-2xl border bg-card p-6 space-y-2">
          <h2 className="text-lg font-medium text-green-700 dark:text-green-400">Recording Complete</h2>
          <p className="text-sm text-muted-foreground">
            Template key: <span className="font-mono font-semibold">{result.saved?.template_key}</span>
            {" · "}{result.pageData?.fields?.length ?? 0} fields detected
            {" · "}{result.pageData?.buttons?.length ?? 0} buttons found
          </p>
          <pre className="rounded-xl bg-muted p-4 text-xs overflow-auto max-h-64">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-3">Stored Templates ({templates.length})</h2>

        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="text-muted-foreground text-sm">No templates recorded yet.</div>
        ) : (
          <div className="grid gap-3">
            {templates.map((t: any) => (
              <div key={t.id} data-testid={`card-template-${t.id}`} className="rounded-2xl border bg-card p-4">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-muted-foreground font-mono">{t.template_key}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Target: {t.start_url} · Updated: {new Date(t.updated_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
