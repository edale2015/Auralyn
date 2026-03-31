import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { HelpCircle, CheckCircle } from "lucide-react";

export interface SuggestedQuestion {
  questionKey: string;
  infoGainScore: number;
  supportingDx: string[];
}

interface Props {
  questions: SuggestedQuestion[];
  answeredKeys?: string[];
  onMarkAnswered?: (key: string) => void;
}

export default function AdaptiveQuestioningPanel({ questions, answeredKeys = [], onMarkAnswered }: Props) {
  const maxGain = Math.max(...questions.map(q => q.infoGainScore), 0.001);

  if (!questions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2" data-testid="no-questions">
        <HelpCircle className="h-8 w-8 opacity-40" />
        <p className="text-sm">No additional questions needed — run an analysis first or seed KB question utility data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="adaptive-questioning-panel">
      <p className="text-xs text-muted-foreground">
        Questions ranked by information gain — highest impact on differential first.
      </p>
      {questions.map((q, i) => {
        const answered = answeredKeys.includes(q.questionKey);
        const pct = ((q.infoGainScore / maxGain) * 100).toFixed(0);
        return (
          <div
            key={q.questionKey}
            data-testid={`question-row-${i}`}
            className={`rounded-lg border p-3 transition-all ${answered ? "opacity-50 bg-muted/30" : "bg-card"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                {answered
                  ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  : <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />}
                <span className="text-sm font-medium">{q.questionKey.replace(/_/g, " ")}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary" className="text-xs py-0">
                  +{q.infoGainScore.toFixed(3)} IG
                </Badge>
                {onMarkAnswered && !answered && (
                  <button
                    data-testid={`mark-answered-${i}`}
                    onClick={() => onMarkAnswered(q.questionKey)}
                    className="text-xs text-blue-600 hover:underline ml-1"
                  >
                    Mark asked
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 ml-6">
              <Progress value={Number(pct)} className="h-1.5" />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {q.supportingDx.map(dx => (
                  <Badge key={dx} variant="outline" className="text-xs py-0">{dx}</Badge>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
