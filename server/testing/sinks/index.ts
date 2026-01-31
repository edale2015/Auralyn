import { TestRunRecord } from "../types";
import { writeToFirestore } from "./firestoreSink";
import { appendToSheets } from "./sheetsSink";

export async function writeRun(record: TestRunRecord) {
  const errs: string[] = [];

  try { await writeToFirestore(record); } catch (e: any) { errs.push(`firestore:${e?.message || e}`); }
  try { await appendToSheets(record); } catch (e: any) { errs.push(`sheets:${e?.message || e}`); }

  if (errs.length) {
    console.warn("writeRun partial failures:", errs.join(" | "));
  }
}
