import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { BrainCircuit, Check, ChevronDown, ChevronUp, Loader2, Play, Send, Sparkles, X } from "lucide-react";

type Suggestion = {
  type: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  proposedRule: string;
};

interface Props {
  selectedComplaint: string | null;
  selectedSystem: string | null;
}

const priorityConfig = {
  high:   { color: "border-red-500/30 text-red-400 bg-red-500/10",    dot: "bg-red-400" },
  medium: { color: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10", dot: "bg-yellow-400" },
  low:    { color: "border-green-500/30 text-green-400 bg-green-500/10",  dot: "bg-green-400" },
};

const typeConfig: Record<string, { label: string; color: string }> = {
  add_question:      { label: "Add Question",   color: "border-blue-500/30 text-blue-400" },
  add_red_flag:      { label: "Add Red Flag",   color: "border-red-500/30 text-red-400" },
  add_treatment:     { label: "Add Treatment",  color: "border-green-500/30 text-green-400" },
  safety_check:      { label: "Safety Check",   color: "border-orange-500/30 text-orange-400" },
  consistency_fix:   { label: "Consistency Fix", color: "border-purple-500/30 text-purple-400" },
};

export default function SuggestionPanel({ selectedComplaint, selectedSystem }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editedRule, setEditedRule] = useState<Record<number, string>>({});
  const [applied, setApplied]   = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const qc = useQueryClient();

  const generateMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/qa/suggestions", {
        complaint: selectedComplaint,
        system: selectedSystem,
        context: {},
      }).then(r => r.json()),
    onSuccess: d => {
      setSuggestions(d.suggestions ?? []);
      setExpanded(null);
      setEditedRule({});
      setApplied(new Set());
    },
    onError: (e: any) => toast({ title: "AI error", description: e.message, variant: "destructive" }),
  });

  const applyMut = useMutation({
    mutationFn: (idx: number) => {
      const s = suggestions[idx];
      return apiRequest("POST", "/api/qa/suggestions/apply", {
        complaint: selectedComplaint,
        title: s.title,
        description: s.description,
        type: s.type,
        proposedRule: editedRule[idx] ?? s.proposedRule,
      }).then(r => r.json());
    },
    onSuccess: (_, idx) => {
      setApplied(prev => new Set([...prev, idx]));
      qc.invalidateQueries({ queryKey: ["/api/qa/audit-insights"] });
      toast({ title: "Suggestion queued", description: "Added to KB review queue" });
    },
    onError: (e: any) => toast({ title: "Apply failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Sparkles size={13} className="text-purple-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Suggestion Engine</span>
      </div>

      <div className="px-3 py-2 border-b flex items-center gap-2">
        {!selectedComplaint ? (
          <div className="text-xs text-muted-foreground italic">Select a complaint to generate suggestions</div>
        ) : (
          <>
            <Badge variant="outline" className="font-mono text-[10px] border-muted-foreground/30">{selectedComplaint}</Badge>
            <Button
              size="sm"
              className="ml-auto h-7 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700"
              disabled={generateMut.isPending}
              onClick={() => generateMut.mutate()}
              data-testid="button-generate-suggestions"
            >
              {generateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
              {generateMut.isPending ? "Analyzing…" : "Generate"}
            </Button>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <BrainCircuit size={32} className="opacity-20" />
            <div className="text-xs text-center max-w-[180px]">
              {selectedComplaint
                ? 'Click "Generate" to get GPT-4o clinical suggestions'
                : "Select a system and complaint first"}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2.5">
            {suggestions.map((s, idx) => {
              const isExpanded = expanded === idx;
              const isApplied  = applied.has(idx);
              const pCfg = priorityConfig[s.priority] ?? priorityConfig.medium;
              const tCfg = typeConfig[s.type] ?? { label: s.type, color: "border-muted-foreground/30 text-muted-foreground" };

              return (
                <Card key={idx} className={cn("border overflow-hidden transition-all", isApplied ? "border-green-500/30 bg-green-500/5" : "border-border/60")}>
                  {/* Header */}
                  <button
                    className="w-full flex items-start gap-2.5 p-3 text-left"
                    onClick={() => setExpanded(isExpanded ? null : idx)}
                    data-testid={`suggestion-${idx}`}
                  >
                    <div className={cn("mt-1 h-2 w-2 rounded-full flex-shrink-0", pCfg.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold leading-snug">{s.title}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", tCfg.color)}>{tCfg.label}</Badge>
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", pCfg.color)}>{s.priority}</Badge>
                        {isApplied && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-green-500/30 text-green-400 bg-green-500/10">Queued ✓</Badge>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={13} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={13} className="text-muted-foreground flex-shrink-0" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                      <p className="text-xs text-muted-foreground pt-2 leading-relaxed">{s.description}</p>

                      <div>
                        <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">Proposed Rule (editable)</div>
                        <Textarea
                          className="text-xs font-mono min-h-[70px] resize-none"
                          value={editedRule[idx] ?? s.proposedRule ?? ""}
                          onChange={e => setEditedRule(prev => ({ ...prev, [idx]: e.target.value }))}
                          data-testid={`input-suggestion-rule-${idx}`}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                          disabled
                          title="Simulation coming soon"
                        >
                          <Play size={11} /> Simulate
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 ml-auto"
                          disabled={isApplied || applyMut.isPending}
                          onClick={() => applyMut.mutate(idx)}
                          data-testid={`button-apply-suggestion-${idx}`}
                        >
                          {isApplied ? <Check size={11} /> : <Send size={11} />}
                          {isApplied ? "Applied" : "Apply to KB"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
