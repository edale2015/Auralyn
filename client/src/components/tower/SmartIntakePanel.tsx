import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info, Star } from "lucide-react";

export interface ScoredQuestion {
  key: string;
  displayText: string;
  score: number;
  infoGain: number;
  redFlagWeight: number;
  required: boolean;
  category: string;
  isRedFlag: boolean;
}

const CATEGORY_COLOR: Record<string, string> = {
  red_flag: "bg-red-100 text-red-800 border-red-300",
  vitals:   "bg-blue-100 text-blue-800 border-blue-300",
  exam:     "bg-purple-100 text-purple-800 border-purple-300",
  hpi:      "bg-green-100 text-green-800 border-green-300",
  risk:     "bg-orange-100 text-orange-800 border-orange-300",
  general:  "bg-gray-100 text-gray-700 border-gray-300",
};

function InfoBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SmartIntakePanel({ questions }: { questions?: ScoredQuestion[] }) {
  if (!questions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2" data-testid="smart-intake-empty">
        <Star className="h-8 w-8 opacity-30" />
        <p className="text-sm text-center">Run analysis to see smart intake questions</p>
        <p className="text-xs opacity-60">Questions ranked by info gain × diagnosis posterior × red-flag weight</p>
      </div>
    );
  }

  const required = questions.filter(q => q.required);
  const redFlags = questions.filter(q => q.isRedFlag && !q.required);
  const regular  = questions.filter(q => !q.isRedFlag && !q.required);

  return (
    <div className="space-y-3" data-testid="smart-intake-panel">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Smart Intake</p>
        <Badge variant="secondary" className="text-xs py-0">{questions.length} scored</Badge>
      </div>

      {required.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />Required
          </p>
          {required.map(q => <QuestionRow key={q.key} q={q} />)}
        </div>
      )}

      {redFlags.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-red-500" />Red Flags
          </p>
          {redFlags.map(q => <QuestionRow key={q.key} q={q} />)}
        </div>
      )}

      {regular.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />Informative
          </p>
          {regular.map(q => <QuestionRow key={q.key} q={q} />)}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q }: { q: ScoredQuestion }) {
  return (
    <div className={`rounded-lg border p-2 space-y-1.5 ${q.isRedFlag ? "border-red-200 bg-red-50/50" : "bg-card"}`}
         data-testid={`smart-q-${q.key}`}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-xs font-medium leading-snug flex-1">{q.displayText}</p>
        <div className="flex items-center gap-1 shrink-0">
          {q.isRedFlag && <AlertTriangle className="h-3 w-3 text-red-500" />}
          <Badge className={`text-xs py-0 border ${CATEGORY_COLOR[q.category] ?? CATEGORY_COLOR.general}`}>
            {q.category.replace("_", " ")}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Info gain</p>
          <InfoBar value={q.infoGain} color="bg-blue-400" />
          <p className="text-xs text-right text-muted-foreground">{q.infoGain.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Score</p>
          <InfoBar value={q.score} color="bg-green-400" />
          <p className="text-xs text-right text-muted-foreground">{q.score.toFixed(3)}</p>
        </div>
      </div>
    </div>
  );
}
