import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";
const SCOPES = (process.env.GOOGLE_EMAIL_SCOPES || "https://www.googleapis.com/auth/gmail.send").split(",");

export interface GoogleEmailConnection {
  clinicId: string;
  userId: string;
  emailAddress: string;
  refreshToken: string;
  createdAt: string;
}

const connections: GoogleEmailConnection[] = [];

export function upsertGoogleEmailConnection(payload: {
  clinicId: string;
  userId: string;
  emailAddress: string;
  refreshToken: string;
}): GoogleEmailConnection {
  const idx = connections.findIndex(
    (c) => c.clinicId === payload.clinicId && c.userId === payload.userId
  );
  const row: GoogleEmailConnection = {
    ...payload,
    createdAt: new Date().toISOString(),
  };
  if (idx >= 0) connections[idx] = row;
  else connections.push(row);
  return row;
}

export function getGoogleEmailConnection(
  clinicId: string,
  userId: string
): GoogleEmailConnection | undefined {
  return connections.find((c) => c.clinicId === clinicId && c.userId === userId);
}

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function buildGoogleEmailAuthUrl(state: string) {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeGoogleEmailCode(code: string) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function encodeMessage(to: string, subject: string, body: string, from: string) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendGoogleEmail(payload: {
  clinicId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
}) {
  const connection = getGoogleEmailConnection(payload.clinicId, payload.userId);
  if (!connection) {
    throw new Error("No Google email connection found");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = encodeMessage(
    payload.to,
    payload.subject,
    payload.body,
    connection.emailAddress
  );

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return result.data;
}
