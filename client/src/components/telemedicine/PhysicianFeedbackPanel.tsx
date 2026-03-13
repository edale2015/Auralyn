import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface Props {
  caseId: string
  systemDiagnosis?: string
  systemDisposition?: string
}

export default function PhysicianFeedbackPanel({ caseId, systemDiagnosis, systemDisposition }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [correctedDx, setCorrectedDx] = useState("")
  const [correctedDisp, setCorrectedDisp] = useState("")
  const [note, setNote] = useState("")
  const [approved, setApproved] = useState<boolean | null>(null)

  const { data: statsData } = useQuery({
    queryKey: ["/api/clinical/physician-feedback/stats"],
    queryFn: () => fetch("/api/clinical/physician-feedback/stats").then((r) => r.json()),
  })

  const feedbackMutation = useMutation({
    mutationFn: (body: any) =>
      fetch("/api/clinical/physician-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: "Feedback recorded", description: "Thank you — the system will learn from this." })
        setCorrectedDx("")
        setCorrectedDisp("")
        setNote("")
        setApproved(null)
        queryClient.invalidateQueries({ queryKey: ["/api/clinical/physician-feedback/stats"] })
      }
    },
    onError: () => toast({ title: "Failed to submit feedback", variant: "destructive" }),
  })

  const stats = statsData?.stats

  function submit(isApproved: boolean) {
    setApproved(isApproved)
    feedbackMutation.mutate({
      caseId,
      systemDiagnosis: systemDiagnosis ?? "unknown",
      systemDisposition: systemDisposition ?? "unknown",
      correctedDiagnosis: correctedDx || undefined,
      correctedDisposition: correctedDisp || undefined,
      physicianNote: note || undefined,
      approved: isApproved,
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            👨‍⚕️ Physician Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>System Dx: <span className="font-semibold text-gray-800">{systemDiagnosis?.replace(/_/g," ") ?? "—"}</span></div>
            <div>System Disposition: <span className="font-semibold text-gray-800">{systemDisposition?.replace(/_/g," ") ?? "—"}</span></div>
          </div>

          <div className="space-y-2">
            <Input
              className="h-7 text-xs"
              placeholder="Correct diagnosis (if different)"
              value={correctedDx}
              onChange={(e) => setCorrectedDx(e.target.value)}
              data-testid="input-corrected-dx"
            />
            <Input
              className="h-7 text-xs"
              placeholder="Correct disposition (if different)"
              value={correctedDisp}
              onChange={(e) => setCorrectedDisp(e.target.value)}
              data-testid="input-corrected-disposition"
            />
            <Textarea
              className="text-xs h-16 resize-none"
              placeholder="Physician note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="textarea-physician-note"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => submit(true)}
              disabled={feedbackMutation.isPending}
              data-testid="btn-approve-diagnosis"
            >
              ✅ Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => submit(false)}
              disabled={feedbackMutation.isPending}
              data-testid="btn-correct-diagnosis"
            >
              ✏️ Correct
            </Button>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              📊 Feedback Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="text-lg font-bold text-green-700">
                  {(stats.approvalRate * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground">Approval Rate</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="text-lg font-bold text-blue-700">{stats.total}</div>
                <div className="text-[10px] text-muted-foreground">Total Feedback</div>
              </div>
            </div>

            {stats.topCorrections?.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Common Corrections
                </div>
                {stats.topCorrections.slice(0, 3).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[10px] bg-muted/40 rounded px-2 py-1">
                    <span className="text-gray-700">{c.pair}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{c.count}×</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
