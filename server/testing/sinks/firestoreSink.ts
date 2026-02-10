import { getFirestore } from "../../firebase";
import { TestRunRecord } from "../types";

export async function writeToFirestore(record: TestRunRecord) {
  const db = getFirestore();
  await db.collection("test_runs").doc(record.runId).set(record, { merge: true });
}
