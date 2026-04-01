import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  BookOpen, CheckCircle2, ChevronRight, Clock,
  FileText, Loader2, Plus, Sparkles, Upload,
} from "lucide-react";

type Guideline = {
  id: number; source: string; title: string; status: string; created_at: string;
  recommendation_count: number; approved_count: number; pending_count: number;
};

const sourceColors: Record<string, string> = {
  manual: "border-blue-500/30 text-blue-400",
  pubmed: "border-green-500/30 text-green-400",
  pdf:    "border-purple-500/30 text-purple-400",
};

export default function GuidelineIngestPanel() {
  const [title,   setTitle]   = useState("");
  const [content, setContent] = useState("");
  const [complaint, setComplaint] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const guidelinesQ = useQuery<{ ok: boolean; guidelines: Guideline[] }>({
    queryKey: ["/api/improvement/guidelines"],
    refetchInterval: 15_000,
  });

  const ingestMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/improvement/ingest", { title, content, complaint, source: "manual" }).then(r => r.json()),
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ["/api/improvement/guidelines"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/recommendations"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/stats"] });
      toast({ title: "Guideline Ingested", description: `${d.rulesExtracted} clinical rules extracted` });
      setTitle(""); setContent(""); setComplaint("");
    },
    onError: (e: any) => toast({ title: "Ingest failed", description: e.message, variant: "destructive" }),
  });

  const guidelines = guidelinesQ.data?.guidelines ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Upload size={13} className="text-blue-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guideline Ingestion</span>
        <Badge variant="outline" className="ml-auto text-[10px] h-4 border-muted-foreground/30">{guidelines.length} loaded</Badge>
      </div>

      {/* Paste form */}
      <div className="p-3 border-b space-y-2.5">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Title (optional)</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. IDSA 2024 Strep Pharyngitis Guidelines"
            className="h-7 text-xs"
            data-testid="input-guideline-title"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Complaint focus (optional)</Label>
          <Input
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            placeholder="e.g. sore_throat"
            className="h-7 text-xs font-mono"
            data-testid="input-guideline-complaint"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Guideline text / clinical excerpt</Label>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste guideline text, clinical criteria, or medical literature…"
            className="text-xs min-h-[90px] resize-none"
            data-testid="textarea-guideline-content"
          />
        </div>
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-2 bg-blue-600 hover:bg-blue-700"
          disabled={ingestMut.isPending || content.trim().length < 20}
          onClick={() => ingestMut.mutate()}
          data-testid="button-ingest-guideline"
        >
          {ingestMut.isPending
            ? <><Loader2 size={12} className="animate-spin" /> Extracting rules…</>
            : <><Sparkles size={12} /> Extract Clinical Rules (GPT-4o)</>}
        </Button>
        {ingestMut.data && (
          <Card className="p-2.5 border-green-500/20 bg-green-500/5 text-xs">
            <div className="font-semibold text-green-400 flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={12} /> {ingestMut.data.rulesExtracted} rules extracted
            </div>
            {ingestMut.data.summary && <div className="text-muted-foreground">{ingestMut.data.summary}</div>}
          </Card>
        )}
      </div>

      {/* Guidelines list */}
      <ScrollArea className="flex-1">
        {guidelinesQ.isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : guidelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <FileText size={28} className="opacity-20" />
            <div className="text-xs">No guidelines ingested yet</div>
            <div className="text-[11px] opacity-60">Paste text above or fetch from PubMed</div>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {guidelines.map(g => (
              <Card key={g.id} className="p-2.5 border border-border/50">
                <div className="flex items-start gap-2">
                  <BookOpen size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{g.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", sourceColors[g.source] ?? "border-muted-foreground/30 text-muted-foreground")}>{g.source}</Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Plus size={9} /> {g.recommendation_count} rules
                      </span>
                      {g.approved_count > 0 && (
                        <span className="text-[10px] text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={9} /> {g.approved_count} approved
                        </span>
                      )}
                      {g.pending_count > 0 && (
                        <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                          <Clock size={9} /> {g.pending_count} pending
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
