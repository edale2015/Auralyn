import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type BulkPreviewItem = {
  caseId: string
  patientId?: string
  action: string
  preview: string
  risks: string[]
  blocked: boolean
  blockReason?: string
}

type BulkPreview = {
  action: string
  totalTargets: number
  blocked: number
  safe: number
  items: BulkPreviewItem[]
  estimatedRisks: string[]
}

export default function BulkActionPreviewModal({
  preview,
  onConfirm,
  onCancel,
  loading,
}: {
  preview: BulkPreview
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Bulk Action Preview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Action: <span className="font-mono">{preview.action}</span> ·{" "}
            {preview.totalTargets} targets · {preview.safe} safe · {preview.blocked} blocked
          </p>
        </div>

        {preview.estimatedRisks.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 border-b">
            <p className="text-xs font-semibold text-amber-700 mb-1">Estimated risks</p>
            {preview.estimatedRisks.map((r) => (
              <p key={r} className="text-xs text-amber-600">• {r}</p>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 px-5 py-3">
          <div className="space-y-2">
            {preview.items.map((item) => (
              <div
                key={item.caseId}
                className={cn(
                  "border rounded-lg px-3 py-2 text-xs",
                  item.blocked ? "bg-red-50 border-red-200" : "bg-card"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-medium">{item.caseId}</span>
                  <Badge className={cn("text-[10px]", item.blocked ? "bg-red-500 text-white" : "bg-green-500 text-white")}>
                    {item.blocked ? "Blocked" : "Safe"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{item.preview}</p>
                {item.blocked && item.blockReason && (
                  <p className="text-red-600 mt-0.5">⛔ {item.blockReason}</p>
                )}
                {item.risks.map((r) => (
                  <p key={r} className="text-amber-600 mt-0.5">⚠ {r}</p>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          {preview.blocked > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I acknowledge {preview.blocked} blocked targets will be skipped
            </label>
          )}
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={loading || (preview.blocked > 0 && !confirmed)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {loading ? "Sending…" : `Confirm (${preview.safe} safe)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
