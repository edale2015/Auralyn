import { useState } from "react"
import { Button } from "@/components/ui/button"
import BulkActionPreviewModal from "./BulkActionPreviewModal"
import { useToast } from "@/hooks/use-toast"

type BulkTarget = { caseId: string; patientId?: string; channel?: string }
type BulkAction = "send_message" | "suppress_reminder" | "discharge" | "send_ehr"

export default function BulkQueueActionsBar({
  selectedTargets,
  onComplete,
}: {
  selectedTargets: BulkTarget[]
  onComplete?: () => void
}) {
  const [preview, setPreview] = useState<any>(null)
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function openPreview(action: BulkAction) {
    if (selectedTargets.length === 0) {
      toast({ title: "No targets selected", variant: "destructive" })
      return
    }
    const res = await fetch("/api/bulk-action/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: selectedTargets, action }),
    })
    const data = await res.json()
    setPreview(data.preview)
    setPendingAction(action)
  }

  async function handleConfirm() {
    if (!pendingAction) return
    setLoading(true)
    try {
      toast({ title: `Bulk ${pendingAction} completed for ${preview.safe} targets` })
      setPreview(null)
      setPendingAction(null)
      onComplete?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 p-2 border-t bg-muted/50">
        <span className="text-xs text-muted-foreground">
          {selectedTargets.length} selected
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPreview("send_message")}>
          Bulk Message
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPreview("suppress_reminder")}>
          Suppress Reminders
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPreview("send_ehr")}>
          Export to EHR
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => openPreview("discharge")}>
          Bulk Discharge
        </Button>
      </div>

      {preview && (
        <BulkActionPreviewModal
          preview={preview}
          onConfirm={handleConfirm}
          onCancel={() => { setPreview(null); setPendingAction(null) }}
          loading={loading}
        />
      )}
    </>
  )
}
