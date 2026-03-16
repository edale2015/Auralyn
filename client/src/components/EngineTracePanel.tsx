import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { RefreshCw, Trash2, Activity, Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

interface TraceEntry {
  engine: string;
  output: unknown;
  input?: unknown;
  durationMs?: number;
  timestamp: string;
  sessionId?: string;
  caseId?: string;
}

interface TraceStats {
  total: number;
  engines: Record<string, number>;
  avgDurationMs: number;
}

interface EngineTrcePanelProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const ENGINE_COLORS: Record<string, string> = {
  conversationAuditEngine:    'bg-blue-500',
  promptImprovementEngine:    'bg-purple-500',
  deEscalationEngine:         'bg-amber-500',
  toneStrategyEngine:         'bg-teal-500',
  physicianPromptOverride:    'bg-red-500',
  goldenConversationBuilder:  'bg-green-500',
  clinicalBrain:              'bg-indigo-500',
  riskStratification:         'bg-orange-500',
  evidenceRetrieval:          'bg-sky-500',
};

function engineColor(name: string): string {
  for (const key of Object.keys(ENGINE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return ENGINE_COLORS[key];
  }
  return 'bg-slate-500';
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return ts;
  }
}

export default function EngineTracePanel({ autoRefresh = true, refreshInterval = 5000, className }: EngineTrcePanelProps) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: trace = [], isLoading } = useQuery<TraceEntry[]>({
    queryKey: ['/api/conversation-opt/engine-trace'],
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  const { data: stats } = useQuery<TraceStats>({
    queryKey: ['/api/conversation-opt/engine-trace/stats'],
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  const filtered = filter
    ? trace.filter((t) => t.engine.toLowerCase().includes(filter.toLowerCase()))
    : trace;

  const handleClear = async () => {
    await apiRequest('DELETE', '/api/conversation-opt/engine-trace');
    qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace'] });
    qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace/stats'] });
  };

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace'] });
    qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace/stats'] });
  };

  return (
    <div className={cn('flex flex-col border border-border rounded-xl bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Engine Trace Log</span>
        {stats && (
          <Badge variant="secondary" className="ml-1 text-xs">
            {stats.total} calls · avg {stats.avgDurationMs}ms
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter engine..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-7 h-7 text-xs w-36"
              data-testid="input-engine-filter"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} data-testid="button-refresh-trace">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleClear} data-testid="button-clear-trace">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats Strip */}
      {stats && Object.keys(stats.engines).length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5 bg-muted/30">
          {Object.entries(stats.engines)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([eng, count]) => (
              <Badge
                key={eng}
                variant="outline"
                className="text-[10px] cursor-pointer hover:bg-primary/10"
                onClick={() => setFilter(filter === eng ? '' : eng)}
              >
                {eng.replace(/Engine$/, '').replace(/([A-Z])/g, ' $1').trim()} × {count}
              </Badge>
            ))}
        </div>
      )}

      {/* Trace Entries */}
      <ScrollArea style={{ maxHeight: 400 }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">{isLoading ? 'Loading trace...' : filter ? 'No matching engines' : 'No trace entries yet'}</p>
            {!filter && !isLoading && (
              <p className="text-xs mt-1 opacity-60">Trace entries appear as engines run</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((entry, i) => (
              <div
                key={i}
                className="px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === i ? null : i)}
                data-testid={`trace-entry-${i}`}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', engineColor(entry.engine))} />
                  <span className="text-xs font-mono font-medium text-foreground">{entry.engine}</span>
                  {entry.durationMs != null && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                      <Clock className="h-2.5 w-2.5" />
                      {entry.durationMs}ms
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono">{formatTs(entry.timestamp)}</span>
                </div>
                {expanded === i && (
                  <div className="mt-2 rounded-lg bg-muted/50 p-2 text-[10px] font-mono text-muted-foreground overflow-x-auto">
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(entry.output, null, 2)}
                    </pre>
                    {entry.input && (
                      <>
                        <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Input</div>
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(entry.input, null, 2)}</pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
