import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Template = { id: string; name: string };

export default function AIAssistant() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/aiTasks/templates");
        const json = await res.json();
        setTemplates(json.templates || []);
      } catch {}
    })();
  }, []);

  async function run() {
    if (!selectedTemplate || !input.trim()) return;
    setLoading(true);
    try {
      const variables: Record<string, string> = {};
      if (selectedTemplate === "clinical_reasoning") {
        variables.symptoms = input;
        variables.history = "Not specified";
      } else if (selectedTemplate === "note_enhancement") {
        variables.note = input;
      } else {
        variables.topic = input;
      }

      const res = await authFetch("/api/aiTasks/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate, variables }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOutput(json.output || "No output");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-ai-assistant">
      <div className="flex items-center gap-3"><Sparkles className="h-5 w-5" /><h2 className="text-xl font-semibold">AI Assistant</h2></div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">AI Reasoning</CardTitle></CardHeader><CardContent className="space-y-3">
        <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <SelectTrigger data-testid="select-template"><SelectValue placeholder="Select template" /></SelectTrigger>
          <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea placeholder="Enter your input..." value={input} onChange={(e) => setInput(e.target.value)} rows={4} data-testid="input-content" />
        <Button onClick={run} disabled={loading || !selectedTemplate || !input.trim()} data-testid="button-run">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Run AI
        </Button>
      </CardContent></Card>
      {output && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Output</CardTitle></CardHeader><CardContent>
          <div className="text-sm whitespace-pre-wrap" data-testid="text-output">{output}</div>
        </CardContent></Card>
      )}
    </div>
  );
}
