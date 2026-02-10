import { google } from "googleapis";

let sheets: ReturnType<typeof google.sheets> | null = null;
let sheetsRW: ReturnType<typeof google.sheets> | null = null;

function buildAuth(scopes: string[]) {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return credsJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes,
      })
    : new google.auth.GoogleAuth({ scopes });
}

export function getSheetsClient() {
  if (sheets) return sheets;
  const auth = buildAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

export function getSheetsClientRW() {
  if (sheetsRW) return sheetsRW;
  const auth = buildAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  sheetsRW = google.sheets({ version: "v4", auth });
  return sheetsRW;
}
