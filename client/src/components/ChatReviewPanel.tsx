import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle, ShieldAlert, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'patient' | 'ai' | 'physician';
  text?: string;
  content?: string;
}

interface AuditResult {
  grade?: string;
  overallScore?: number;
  empathyScore?: number;
  clarityScore?: number;
  safetyScore?: number;
  completenessScore?: number;
  flags?: { message: string; severity: string }[];
  improvements?: string[];
  unsafePhrases?: string[];
  missedQuestions?: string[];
}

interface ChatReviewPanelProps {
  messages: ChatMessage[];
  audit: AuditResult;
  className?: string;
}

const ROLE_CONFIG: Record<string, { label: string; align: string; bubble: string }> = {
  patient:   { label: 'Patient',    align: 'justify-start',  bubble: 'bg-muted text-foreground' },
  ai:        { label: 'AI Triage',  align: 'justify-end',    bubble: 'bg-primary text-primary-foreground' },
  physician: { label: 'Physician',  align: 'justify-center', bubble: 'bg-amber-100 dark:bg-amber-900 text-foreground border border-amber-300' },
};

function ScoreBar({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={warn && pct < 50 ? 'text-red-500 font-semibold' : ''}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === 'A' ? 'bg-green-500' :
    grade === 'B' ? 'bg-emerald-500' :
    grade === 'C' ? 'bg-amber-500' :
    grade === 'D' ? 'bg-orange-500' : 'bg-red-600';
  return (
    <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl text-white font-bold text-xl shadow-lg', color)}>
      {grade}
    </div>
  );
}

export default function ChatReviewPanel({ messages, audit, className }: ChatReviewPanelProps) {
  const grade = audit.grade ?? 'N/A';
  const overall = audit.overallScore ?? 0;

  const criticalFlags = (audit.flags ?? []).filter((f) => f.severity === 'critical');
  const warnFlags = (audit.flags ?? []).filter((f) => f.severity === 'warning');

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-4', className)}>
      {/* Chat Transcript */}
      <div className="flex flex-col border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Conversation Transcript</span>
          <Badge variant="outline" className="ml-auto">{messages.length} turns</Badge>
        </div>
        <ScrollArea className="flex-1 p-4" style={{ maxHeight: 420 }}>
          <div className="space-y-3">
            {messages.map((m, i) => {
              const text = m.text ?? m.content ?? '';
              const cfg = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.patient;
              return (
                <div key={i} className={cn('flex', cfg.align)}>
                  <div className="max-w-[85%]">
                    <p className="text-[10px] text-muted-foreground mb-0.5 px-1 capitalize">{cfg.label}</p>
                    <div
                      className={cn('rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm', cfg.bubble)}
                      data-testid={`chat-message-${i}`}
                    >
                      {text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Audit Panel */}
      <div className="flex flex-col gap-4">
        {/* Grade + Overall */}
        <div className="border border-border rounded-xl bg-card p-4 flex items-center gap-4">
          <GradeBadge grade={grade} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Conversation Grade</p>
            <p className="text-xs text-muted-foreground mb-2">Overall quality score</p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', overall >= 0.75 ? 'bg-green-500' : overall >= 0.5 ? 'bg-amber-500' : 'bg-red-500')}
                style={{ width: `${Math.round(overall * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{Math.round(overall * 100)}% overall</p>
          </div>
        </div>

        {/* Score Bars */}
        <div className="border border-border rounded-xl bg-card p-4 space-y-3">
          <p className="text-sm font-semibold mb-2">Dimension Scores</p>
          <ScoreBar label="Empathy"      value={audit.empathyScore ?? 0}      warn />
          <ScoreBar label="Clarity"      value={audit.clarityScore ?? 0} />
          <ScoreBar label="Safety"       value={audit.safetyScore ?? 0}       warn />
          <ScoreBar label="Completeness" value={audit.completenessScore ?? 0} warn />
        </div>

        {/* Flags */}
        {(criticalFlags.length > 0 || warnFlags.length > 0) && (
          <div className="border border-border rounded-xl bg-card p-4 space-y-2">
            <p className="text-sm font-semibold mb-2">Flags</p>
            {criticalFlags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-red-600 text-xs">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
            {warnFlags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-amber-600 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Improvements */}
        {(audit.improvements ?? []).length > 0 && (
          <div className="border border-border rounded-xl bg-card p-4">
            <p className="text-sm font-semibold mb-2">Suggested Improvements</p>
            <ul className="space-y-1.5">
              {(audit.improvements ?? []).map((imp, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                  <span>{imp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
