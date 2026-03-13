import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, HelpCircle, Sparkles, Brain } from "lucide-react"
import { adaptiveQuestionApi, type WeightedQuestion } from "@/lib/adaptiveQuestionApi"
import { useToast } from "@/hooks/use-toast"

interface Props {
  caseId?: string
  state?: any
  onAnswered?: (question: string, answer: boolean, updatedState: any) => void
  className?: string
}

function EIGBar({ eig, weight }: { eig: number; weight: number }) {
  const adjusted = eig * weight
  const pct = Math.min(100, Math.round(adjusted * 600))
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums">
        EIG {eig.toFixed(3)}
        {weight !== 1 && (
          <span className="text-violet-500"> ×{weight.toFixed(1)}</span>
        )}
      </span>
    </div>
  )
}

export default function AdaptiveQuestionPanel({ caseId, state, onAnswered, className = "" }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [answered, setAnswered] = useState<Record<string, boolean | null>>({})

  const { data, isLoading } = useQuery({
    queryKey: ["aqleQuestions", caseId ?? "state", state],
    queryFn: () =>
      caseId
        ? adaptiveQuestionApi.getForCase(caseId)
        : adaptiveQuestionApi.fromState(state),
    enabled: !!(caseId || state?.complaint),
    staleTime: 20_000,
  })

  const recordMutation = useMutation({
    mutationFn: (payload: {
      question: string
      answer: boolean
      stateBefore: any
    }) =>
      adaptiveQuestionApi.recordAnswer({
        caseId: caseId ?? "unknown",
        complaint: data?.complaint ?? "unknown",
        question: payload.question,
        stateBefore: payload.stateBefore,
        stateAfter: {
          ...payload.stateBefore,
          symptoms: payload.answer
            ? `${payload.stateBefore.symptoms ?? ""} yes: ${payload.question}`
            : `${payload.stateBefore.symptoms ?? ""} no: ${payload.question}`,
        },
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["aqleQuestions"] })
      onAnswered?.(vars.question, vars.answer, {})
      toast({
        title: vars.answer ? "Answer recorded: Yes" : "Answer recorded: No",
        description: "Question impact logged for learning.",
      })
    },
  })

  const questions = data?.questions ?? []
  const top5 = questions.slice(0, 5)

  return (
    <Card className={className} data-testid="adaptive-question-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-violet-500" />
          Adaptive Questions
          <Badge variant="outline" className="ml-auto text-xs">
            <Brain className="h-3 w-3 mr-1" />
            policy-weighted
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {!isLoading && !top5.length && (
          <p className="text-sm text-slate-400">
            No questions available. Set complaint and symptoms first.
          </p>
        )}
        {top5.map((q: WeightedQuestion, i: number) => {
          const ans = answered[q.text]
          return (
            <div
              key={q.text}
              className={`mb-2 rounded-xl border p-3 transition-colors ${
                ans === true
                  ? "border-emerald-200 bg-emerald-50"
                  : ans === false
                    ? "border-rose-200 bg-rose-50"
                    : "bg-slate-50"
              }`}
              data-testid={`adaptive-question-${i}`}
            >
              <div className="flex items-start gap-2">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                <span className="flex-1 text-sm font-medium leading-snug">{q.text}</span>
              </div>
              <EIGBar eig={q.expectedInfoGain} weight={q.policyWeight} />
              {q.targetDiagnoses?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {q.targetDiagnoses.slice(0, 3).map((dx) => (
                    <span
                      key={dx}
                      className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500 border"
                    >
                      {dx}
                    </span>
                  ))}
                </div>
              )}
              {ans === undefined || ans === null ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    data-testid={`btn-yes-${i}`}
                    disabled={recordMutation.isPending}
                    onClick={() => {
                      setAnswered((prev) => ({ ...prev, [q.text]: true }))
                      recordMutation.mutate({
                        question: q.text,
                        answer: true,
                        stateBefore: state ?? {},
                      })
                    }}
                  >
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                    data-testid={`btn-no-${i}`}
                    disabled={recordMutation.isPending}
                    onClick={() => {
                      setAnswered((prev) => ({ ...prev, [q.text]: false }))
                      recordMutation.mutate({
                        question: q.text,
                        answer: false,
                        stateBefore: state ?? {},
                      })
                    }}
                  >
                    <XCircle className="mr-1 h-3 w-3" />
                    No
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Answered: <strong>{ans ? "Yes" : "No"}</strong> — impact logged
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
