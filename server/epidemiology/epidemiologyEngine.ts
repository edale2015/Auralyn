import * as fs from "fs/promises"
import * as path from "path"

const AUDIT_LOG = path.resolve(
  process.cwd(),
  "server/data/runtime/case_audit_log.ndjson"
)

export interface ComplaintTrend {
  complaint: string
  count7Days: number
  count24Hours: number
  trend: "surge" | "elevated" | "normal" | "low"
  changePercent: number
}

export interface EpidemiologyReport {
  trends: ComplaintTrend[]
  surges: string[]
  reportedAt: string
  windowDays: number
}

interface AuditEntry {
  complaint?: string
  timestamp?: string
  [key: string]: any
}

async function loadRecentCases(windowDays = 30): Promise<AuditEntry[]> {
  try {
    const raw = await fs.readFile(AUDIT_LOG, "utf8")
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l): AuditEntry => {
        try {
          return JSON.parse(l)
        } catch {
          return {}
        }
      })
      .filter((r) => r.timestamp && new Date(r.timestamp).getTime() > cutoff)
  } catch {
    return []
  }
}

export async function generateEpidemiologyReport(windowDays = 7): Promise<EpidemiologyReport> {
  const recent = await loadRecentCases(windowDays * 2)
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const window7 = now - windowDays * dayMs
  const window24 = now - dayMs

  const complaints7: Record<string, number> = {}
  const complaints24: Record<string, number> = {}
  const complaintsPrev7: Record<string, number> = {}

  for (const r of recent) {
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0
    const complaint = r.complaint ?? r.chiefComplaint ?? "unknown"
    if (!complaint || complaint === "unknown") continue

    if (ts > window7) {
      complaints7[complaint] = (complaints7[complaint] ?? 0) + 1
    } else {
      complaintsPrev7[complaint] = (complaintsPrev7[complaint] ?? 0) + 1
    }
    if (ts > window24) {
      complaints24[complaint] = (complaints24[complaint] ?? 0) + 1
    }
  }

  const allComplaints = new Set([
    ...Object.keys(complaints7),
    ...Object.keys(complaintsPrev7),
  ])

  const trends: ComplaintTrend[] = []
  const surges: string[] = []

  for (const complaint of allComplaints) {
    const count7 = complaints7[complaint] ?? 0
    const count24 = complaints24[complaint] ?? 0
    const prev7 = complaintsPrev7[complaint] ?? 0

    const changePercent = prev7 > 0 ? ((count7 - prev7) / prev7) * 100 : count7 > 0 ? 100 : 0

    let trend: ComplaintTrend["trend"] = "normal"
    if (changePercent > 50) {
      trend = "surge"
      surges.push(complaint)
    } else if (changePercent > 20) {
      trend = "elevated"
    } else if (changePercent < -20) {
      trend = "low"
    }

    trends.push({ complaint, count7Days: count7, count24Hours: count24, trend, changePercent })
  }

  return {
    trends: trends.sort((a, b) => b.count7Days - a.count7Days),
    surges,
    reportedAt: new Date().toISOString(),
    windowDays,
  }
}

export function detectOutbreak(trends: ComplaintTrend[]): {
  outbreak: boolean
  complaint?: string
  message?: string
} {
  const surge = trends.find((t) => t.trend === "surge" && t.count7Days >= 5)
  if (surge) {
    return {
      outbreak: true,
      complaint: surge.complaint,
      message: `Possible ${surge.complaint} surge: ${surge.count7Days} cases in 7 days (+${surge.changePercent.toFixed(0)}%)`,
    }
  }
  return { outbreak: false }
}
