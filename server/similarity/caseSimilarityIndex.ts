import * as fs from "fs/promises"
import * as path from "path"
import { extractCaseFeatures } from "./caseFeatureExtractor"
import { saveSimilarityIndex, loadSimilarityIndex } from "./caseSimilarityStore"
import { readAllEvents } from "../core/events/eventStream"

const RUNTIME_DIR = path.resolve(process.cwd(), "data/runtime")
const SERVER_RUNTIME = path.resolve(process.cwd(), "server/data/runtime")

async function loadNdjson(dir: string, fileName: string): Promise<any[]> {
  for (const d of [dir, SERVER_RUNTIME]) {
    try {
      const raw = await fs.readFile(path.join(d, fileName), "utf8")
      return raw.split(/\r?\n/).filter(Boolean).map(l => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    } catch { /* try next dir */ }
  }
  return []
}

export async function rebuildCaseSimilarityIndex(): Promise<{ count: number; source: string }> {
  const caseAudits = await loadNdjson(RUNTIME_DIR, "case_audit_log.ndjson")
  const reconciliations = await loadNdjson(RUNTIME_DIR, "case_reconciliation.ndjson")

  const reconMap = new Map<string, any>()
  for (const row of reconciliations) {
    reconMap.set(row.case_id ?? row.caseId, row)
  }

  const indexRows: any[] = []

  for (const audit of caseAudits) {
    const caseId = audit.caseId ?? audit.case_id
    const recon = reconMap.get(caseId)

    const pseudoState = {
      caseId,
      complaint: audit.complaintId ?? audit.complaint_id ?? "unknown",
      symptoms: audit.rawText ?? "",
      alerts: audit.redFlagHits ?? [],
      disposition: audit.finalDisposition ?? audit.disposition ?? "unknown",
      differential: (audit.differentialTop3 ?? []).map((d: string) => ({ diagnosis: d })),
      patient: { age: audit.age, sex: audit.sex },
    }

    indexRows.push({
      ...extractCaseFeatures(pseudoState),
      outcome: recon ? {
        actualDiagnosis: recon.actualFinalDiagnosis ?? "",
        actualDisposition: recon.actualDisposition ?? "",
        topPredictionMatch: Boolean(recon.top_prediction_match),
        dispositionMatch: Boolean(recon.disposition_match),
        safetyMiss: Boolean(recon.safety_miss_flag),
      } : null,
      indexedAt: new Date().toISOString(),
    })
  }

  if (indexRows.length === 0) {
    const events = await readAllEvents()
    const caseIds = [...new Set(events.map(e => e.caseId))]

    for (const caseId of caseIds) {
      const caseEvents = events.filter(e => e.caseId === caseId)
      const pseudoState: any = { caseId, symptoms: "", differential: [], alerts: [], patient: {} }

      for (const ev of caseEvents) {
        const p = ev.payload ?? (ev as any).data ?? {}
        if (ev.type === "SESSION_STARTED") {
          pseudoState.complaint = p.complaint
          pseudoState.patient = p.patient ?? {}
        }
        if (ev.type === "PATIENT_MESSAGE") pseudoState.symptoms += " " + (p.message ?? "")
        if (ev.type === "DIFFERENTIAL_UPDATED") pseudoState.differential = p.differential ?? []
        if (ev.type === "ALERTS_UPDATED") pseudoState.alerts = p.alerts ?? []
        if (ev.type === "DISPOSITION_SET") pseudoState.disposition = p.disposition
        if (ev.type === "OUTCOME_RECORDED") pseudoState.outcome = p
      }

      if (!pseudoState.complaint && !pseudoState.symptoms.trim()) continue

      indexRows.push({
        ...extractCaseFeatures(pseudoState),
        outcome: pseudoState.outcome ?? null,
        indexedAt: new Date().toISOString(),
      })
    }
  }

  await saveSimilarityIndex(indexRows)
  return { count: indexRows.length, source: caseAudits.length > 0 ? "audit_log" : "event_stream" }
}

export async function indexSingleCase(state: any, outcome?: any): Promise<void> {
  const index = await loadSimilarityIndex()
  const features = {
    ...extractCaseFeatures(state),
    outcome: outcome ?? state.outcome ?? null,
    indexedAt: new Date().toISOString(),
  }
  const existing = index.findIndex(r => r.caseId === state.caseId)
  if (existing >= 0) index[existing] = features
  else index.push(features)
  await saveSimilarityIndex(index)
}
