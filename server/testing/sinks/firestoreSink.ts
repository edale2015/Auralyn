import { db } from "../../firebase";
import { TestRunRecord } from "../types";

export async function writeToFirestore(record: TestRunRecord) {
  await db.collection("test_runs").doc(record.runId).set(record, { merge: true });
}
