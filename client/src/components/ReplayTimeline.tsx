import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ShieldAlert, Search, GitBranch, BarChart2, Clock, CheckCircle2,
  FileText, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { useState } from 'react';

export interface ReplayStep {
  engine: string;
  input: unknown;
  output: unknown;
  timestamp: number;
  durationMs?: number;
  confidence?: number;
  layer?: string;
}

export interface CaseReplay {
  caseId: string;
  complaint: string;
  totalSteps: number;
  steps: ReplayStep[];
  finalDisposition?: string;
  overallConfidence?: number;
  replayedAt: string;
}

interface ReplayTimelineProps {
  replay: CaseReplay;
  className?: string;
}

const ENGINE_ICONS: Record<string, React.ReactNode> = {
  'Red Flag':    <ShieldAlert className="h-4 w-4" />,
  'Similarity':  <Search className="h-4 w-4" />,
  'Differential':<GitBranch className="h-4 w-4" />,
  'Bayesian':    <GitBranch className="h-4 w-4" />,
  'Risk':        <AlertTriangle className="h-4 w-4" />,
  'Temporal':    <Clock className="h-4 w-4" />,
  'Consensus':   <CheckCircle2 className="h-4 w-4" />,
  'Disposition': <BarChart2 className="h-4 w-4" />,
  'Note':        <FileText className="h-4 w-4" />,
  'Intake':      <CheckCircle2 className="h-4 w-4" />,
};

const ENGINE_COLORS: Record<string, string> = {
  'Red Flag':    'border-red-500 bg-red-500/10 text-red-600',
  'Similarity':  'border-sky-500 bg-sky-500/10 text-sky-600',
  'Differential':'border-purple-500 bg-purple-500/10 text-purple-600',
  'Bayesian':    'border-purple-500 bg-purple-500/10 text-purple-600',
  'Risk':        'border-orange-500 bg-orange-500/10 text-orange-600',
  'Temporal':    'border-teal-500 bg-teal-500/10 text-teal-600',
  'Consensus':   'border-green-500 bg-green-500/10 text-green-600',
  'Disposition': 'border-blue-500 bg-blue-500/10 text-blue-600',
  'Note':        'border-slate-500 bg-slate-500/10 text-slate-600',
  'Intake':      'border-indigo-500 bg-indigo-500/10 text-indigo-600',
};

function engineKey(name: string): string {
  for (const key of Object.keys(ENGINE_COLORS)) {
    if (name.includes(key)) return key;
  }
  return 'Intake';
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? 'bg-green-500' : pct >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

function StepCard({ step, index, isLast }: { step: ReplayStep; index: number; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const key = engineKey(step.engine);
  const colorClass = ENGINE_COLORS[key];
  const icon = ENGINE_ICONS[key];

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn('flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0', colorClass)}>
          {icon}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
      </div>

      {/* Card */}
      <div
        className={cn('flex-1 mb-4 border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow', colorClass.split(' ')[0])}
        onClick={() => setExpanded((e) => !e)}
        data-testid={`replay-step-${index}`}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">Step {index + 1}</span>
            {step.layer && <Badge variant="outline" className="text-[9px] shrink-0">{step.layer}</Badge>}
            <span className="font-semibold text-sm text-foreground truncate">{step.engine}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {step.confidence !== undefined && <ConfidenceBar value={step.confidence} />}
            {step.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground">{step.durationMs}ms</span>
            )}
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>

        {/* Output preview (always visible) */}
        <div className="px-4 py-2 bg-muted/20 border-t border-border/50">
          <p className="text-xs text-muted-foreground truncate">
            {typeof step.output === 'object' ? JSON.stringify(step.output).slice(0, 120) + '…' : String(step.output)}
          </p>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 py-3 bg-card border-t border-border space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Output</p>
              <pre className="text-[11px] font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
            {step.input && step.input !== '[hidden]' && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Input</p>
                <pre className="text-[11px] font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReplayTimeline({ replay, className }: ReplayTimelineProps) {
  const confPct = Math.round((replay.overallConfidence ?? 0) * 100);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Case ID',      value: replay.caseId.slice(0, 16) + (replay.caseId.length > 16 ? '…' : '') },
          { label: 'Complaint',    value: replay.complaint },
          { label: 'Engine Steps', value: `${replay.totalSteps} steps` },
          { label: 'Avg Confidence', value: `${confPct}%` },
        ].map((s) => (
          <div key={s.label} className="border border-border rounded-xl bg-card p-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">{s.label}</p>
            <p className="font-semibold text-sm text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {replay.finalDisposition && (
        <div className="border border-blue-500/40 bg-blue-500/5 rounded-xl px-4 py-3 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-blue-500 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Final Disposition</p>
            <p className="font-semibold text-sm text-foreground">{replay.finalDisposition}</p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ScrollArea style={{ maxHeight: 560 }}>
        <div className="pr-2 pt-1">
          {replay.steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} isLast={i === replay.steps.length - 1} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
