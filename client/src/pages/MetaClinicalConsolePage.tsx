import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Layers, Cpu, GitBranch, FileInput, Database, FlaskConical,
  Play, Copy, CheckCircle, TrendingUp, Monitor, Sparkles, Target,
  BarChart3, Activity, Shield, Download,
} from "lucide-react";

interface DiagramResult { format: string; content: string; engineCount: number; layerCount: number; generatedAt: string; }
interface CapabilityButton { id: string; label: string; action: string; description: string; category: string; route?: string; apiEndpoint?: string; icon: string; requiresRole: string[]; badgeText?: string; }

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  clinical: { label: 'Clinical', icon: <Sparkles className="h-4 w-4" />, color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
  analytics: { label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  architecture: { label: 'Architecture', icon: <Layers className="h-4 w-4" />, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  simulation: { label: 'Simulation', icon: <FlaskConical className="h-4 w-4" />, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  administration: { label: 'Administration', icon: <Shield className="h-4 w-4" />, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

const ICON_MAP: Record<string, React.ReactNode> = {
  Brain: <Sparkles className="h-5 w-5" />, Sparkles: <Sparkles className="h-5 w-5" />, Monitor: <Monitor className="h-5 w-5" />,
  ClipboardCheck: <CheckCircle className="h-5 w-5" />, TrendingUp: <TrendingUp className="h-5 w-5" />, BarChart3: <BarChart3 className="h-5 w-5" />,
  Activity: <Activity className="h-5 w-5" />, Download: <Download className="h-5 w-5" />, Cpu: <Cpu className="h-5 w-5" />,
  Layers: <Layers className="h-5 w-5" />, GitBranch: <GitBranch className="h-5 w-5" />, FileInput: <FileInput className="h-5 w-5" />,
  Database: <Database className="h-5 w-5" />, FlaskConical: <FlaskConical className="h-5 w-5" />, Target: <Target className="h-5 w-5" />,
  PlusCircle: <Play className="h-5 w-5" />, Shield: <Shield className="h-5 w-5" />,
};

function DiagramPanel() {
  const [format, setFormat] = useState<string>('mermaid');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch } = useQuery<DiagramResult>({
    queryKey: ['/api/meta-clinical/diagram', format],
    queryFn: async () => {
      const res = await fetch(`/api/meta-clinical/diagram?format=${format}`, { credentials: 'include' });
      return res.json();
    },
  });

  const copy = () => {
    if (data?.content) {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={format} onValueChange={(v) => setFormat(v)}>
          <SelectTrigger data-testid="select-diagram-format" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mermaid">Mermaid</SelectItem>
            <SelectItem value="ascii">ASCII</SelectItem>
            <SelectItem value="dot">Graphviz DOT</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
        <Button data-testid="button-refresh-diagram" onClick={() => refetch()} variant="outline" size="sm">
          <Play className="h-3 w-3 mr-1" /> Regenerate
        </Button>
        <Button data-testid="button-copy-diagram" onClick={copy} variant="outline" size="sm" disabled={!data}>
          {copied ? <CheckCircle className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {data && (
          <div className="flex gap-2 ml-auto">
            <Badge variant="outline">{data.engineCount} engines</Badge>
            <Badge variant="outline">{data.layerCount} layers</Badge>
          </div>
        )}
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Generating diagram…</div>}

      {data && (
        <div className="relative">
          {format === 'ascii' ? (
            <pre data-testid="diagram-output" className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre">{data.content}</pre>
          ) : (
            <Textarea
              data-testid="diagram-output"
              value={data.content}
              readOnly
              className="font-mono text-xs min-h-[400px] resize-none bg-muted"
            />
          )}
          {format === 'mermaid' && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <span>Paste into</span>
              <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">mermaid.live</a>
              <span>to render interactively.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KnowledgeExtractor() {
  const { toast } = useToast();
  const [text, setText] = useState('fever causes infection\ninfection leads to sepsis\ncough suggests pneumonia\npneumonia requires chest_xray\nchest_xray indicates consolidation');
  const [result, setResult] = useState<{ edges: any[]; count: number } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/meta-clinical/extract-knowledge', { text });
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ title: `Extracted ${data.count} edges` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Clinical text to extract edges from</Label>
        <Textarea data-testid="input-knowledge-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-sm mt-1" placeholder="fever causes infection&#10;cough suggests pneumonia..." />
      </div>
      <Button data-testid="button-extract-knowledge" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
        <Database className="h-4 w-4" /> {mutation.isPending ? 'Extracting…' : 'Extract Knowledge Edges'}
      </Button>
      {result && (
        <div>
          <div className="text-sm font-medium mb-2">{result.count} edges extracted</div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {result.edges.map((e: any, i: number) => (
              <div key={i} data-testid={`edge-${i}`} className="flex items-center gap-2 text-xs font-mono bg-muted px-2 py-1 rounded">
                <span className="text-blue-600">{e.from}</span>
                <span className="text-muted-foreground">—{e.relation}→</span>
                <span className="text-green-600">{e.to}</span>
                <span className="ml-auto text-muted-foreground">{(e.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PathImporter() {
  const { toast } = useToast();
  const [text, setText] = useState('cough -> pneumonia\npneumonia -> chest_xray [required, 0.9]\nchest_xray -> antibiotics\nfever -> blood_culture [sepsis workup, 0.85]');
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/meta-clinical/import-path', { text });
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ title: `Imported ${data.paths.length} paths, ${data.nodeSet.length} nodes` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Clinical pathway text (A → B format)</Label>
        <Textarea data-testid="input-path-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} className="font-mono text-sm mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Formats: <code>A -&gt; B</code>, <code>A -&gt; B [label]</code>, <code>A -&gt; B [label, 0.9]</code>, <code>A|B|label|weight</code></p>
      </div>
      <Button data-testid="button-import-path" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
        <FileInput className="h-4 w-4" /> {mutation.isPending ? 'Importing…' : 'Import Clinical Paths'}
      </Button>
      {result && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Badge variant="outline">{result.paths.length} paths</Badge>
            <Badge variant="outline">{result.nodeSet.length} unique nodes</Badge>
            {result.parseErrors.length > 0 && <Badge variant="destructive">{result.parseErrors.length} parse errors</Badge>}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {result.paths.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono bg-muted px-2 py-1 rounded">
                <span className="text-blue-600">{p.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-green-600">{p.to}</span>
                {p.label && <span className="text-orange-500">[{p.label}]</span>}
                {p.weight && <span className="ml-auto text-muted-foreground">{p.weight}</span>}
              </div>
            ))}
          </div>
          {result.parseErrors.length > 0 && (
            <div className="space-y-1">
              {result.parseErrors.map((e: any, i: number) => (
                <div key={i} className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded">Line {e.line}: {e.reason} — <code>{e.raw}</code></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityGrid() {
  const { data: buttons } = useQuery<CapabilityButton[]>({ queryKey: ['/api/meta-clinical/capabilities'] });
  const categories = ['clinical', 'analytics', 'architecture', 'simulation', 'administration'];

  return (
    <div className="space-y-6">
      {categories.map((cat) => {
        const catButtons = (buttons ?? []).filter((b) => b.category === cat);
        if (!catButtons.length) return null;
        const meta = CATEGORY_LABELS[cat];
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catButtons.map((btn) => (
                <Card key={btn.id} data-testid={`capability-card-${btn.id}`}
                  className="hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => btn.route && (window.location.href = btn.route)}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors text-muted-foreground">
                        {ICON_MAP[btn.icon] ?? <Cpu className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{btn.label}</span>
                          {btn.badgeText && <Badge className="text-[10px] h-4 px-1.5 bg-violet-600">{btn.badgeText}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{btn.description}</p>
                        {btn.apiEndpoint && <span className="text-[10px] font-mono text-muted-foreground/60 mt-1 block">{btn.apiEndpoint}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MetaClinicalConsolePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-violet-500" />
          Meta-Clinical Console
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Top-level clinical intelligence tools — architecture visualization, knowledge extraction, path import, and system capabilities
        </p>
      </div>

      <Tabs defaultValue="capabilities">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="capabilities" data-testid="tab-capabilities">System Capabilities</TabsTrigger>
          <TabsTrigger value="diagram" data-testid="tab-diagram">Architecture Diagram</TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">Knowledge Extractor</TabsTrigger>
          <TabsTrigger value="paths" data-testid="tab-paths">Path Importer</TabsTrigger>
        </TabsList>

        <TabsContent value="capabilities" className="mt-4">
          <CapabilityGrid />
        </TabsContent>

        <TabsContent value="diagram" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-500" /> Live Architecture Diagram Generator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DiagramPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" /> Clinical Knowledge Extraction Engine
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KnowledgeExtractor />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paths" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-green-500" /> Clinical Path Importer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PathImporter />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
