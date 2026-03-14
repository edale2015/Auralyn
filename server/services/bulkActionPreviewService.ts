export type BulkTarget = { caseId: string; patientId?: string; channel?: string; lang?: string }
export type BulkAction = "send_message" | "suppress_reminder" | "discharge" | "send_ehr"

export type BulkPreviewItem = {
  caseId: string
  patientId?: string
  action: BulkAction
  preview: string
  risks: string[]
  blocked: boolean
  blockReason?: string
}

export type BulkPreviewResult = {
  action: BulkAction
  totalTargets: number
  blocked: number
  safe: number
  items: BulkPreviewItem[]
  estimatedRisks: string[]
}

export function buildBulkPreview(
  targets: BulkTarget[],
  action: BulkAction,
  messageTemplate?: string
): BulkPreviewResult {
  const items: BulkPreviewItem[] = targets.map((t) => {
    const risks: string[] = []
    let blocked = false
    let blockReason: string | undefined

    if (action === "send_message" && !messageTemplate) {
      blocked = true
      blockReason = "No message template provided"
    }

    if (action === "discharge" && !t.patientId) {
      risks.push("No patient ID — discharge may be incomplete")
    }

    if (action === "send_ehr" && !t.caseId) {
      blocked = true
      blockReason = "Missing caseId for EHR export"
    }

    let preview = ""
    if (action === "send_message") preview = `Send to ${t.channel ?? "default"}: "${(messageTemplate ?? "").slice(0, 80)}"`
    else if (action === "suppress_reminder") preview = `Suppress all pending reminders for case ${t.caseId}`
    else if (action === "discharge") preview = `Discharge patient ${t.patientId ?? t.caseId}`
    else if (action === "send_ehr") preview = `Export case ${t.caseId} to EHR`

    return { caseId: t.caseId, patientId: t.patientId, action, preview, risks, blocked, blockReason }
  })

  const blocked = items.filter((i) => i.blocked).length
  const allRisks = [...new Set(items.flatMap((i) => i.risks))]

  return {
    action,
    totalTargets: targets.length,
    blocked,
    safe: targets.length - blocked,
    items,
    estimatedRisks: allRisks,
  }
}
