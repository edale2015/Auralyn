import admin from "firebase-admin";

const RUNTIME_METRICS_COLLECTION = "runtime_metrics";

function getDb() {
  return admin.firestore();
}

function nowIso(): string {
  return new Date().toISOString();
}

function metricId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface RuntimeMetricRecord {
  metricId: string;
  createdAt: string;
  type:
    | "ENGINE_RUN"
    | "CASE_CREATED"
    | "RED_FLAG_TRIGGER"
    | "SIGNOFF_CREATED"
    | "DISCREPANCY"
    | "EXPORT_ECW"
    | "CUSTOM";
  complaintId?: string;
  caseId?: string;
  reviewerId?: string;
  engineVersion?: string;
  disposition?: string;
  winningClusterId?: string;
  payload?: Record<string, unknown>;
}

export class FirestoreRuntimeMetricsStore {
  private db = getDb();
  private col = this.db.collection(RUNTIME_METRICS_COLLECTION);

  async logMetric(input: Omit<RuntimeMetricRecord, "metricId" | "createdAt">): Promise<RuntimeMetricRecord> {
    const record: RuntimeMetricRecord = {
      metricId: metricId(input.type.toLowerCase()),
      createdAt: nowIso(),
      ...input,
    };

    await this.col.doc(record.metricId).set(record);
    return record;
  }

  async listMetricsByComplaint(complaintId: string, limit = 500): Promise<RuntimeMetricRecord[]> {
    const snap = await this.col
      .where("complaintId", "==", complaintId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as RuntimeMetricRecord);
  }

  async listRecentMetrics(limit = 500): Promise<RuntimeMetricRecord[]> {
    const snap = await this.col
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as RuntimeMetricRecord);
  }
}

export const firestoreRuntimeMetricsStore = new FirestoreRuntimeMetricsStore();
