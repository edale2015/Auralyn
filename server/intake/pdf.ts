import * as fs from "fs";
import * as path from "path";

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderSummaryHtml(caseId: string, intake: any, assistant: any) {
  const cc = intake?.chiefComplaint || "Visit";
  const redFlags: string[] = assistant?.redFlags || [];
  const triage = assistant?.triageLevel || "Routine";

  return `
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Visit Summary</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        h1 { margin: 0 0 8px 0; font-size: 20px; }
        h2 { margin: 0 0 8px 0; font-size: 16px; }
        .muted { color: #555; }
        ul { margin: 8px 0 0 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Visit Summary</h1>
        <div class="muted">Case ID: ${escapeHtml(caseId)}</div>
      </div>

      <div class="card">
        <h2>Chief complaint</h2>
        <div>${escapeHtml(cc)}</div>
      </div>

      <div class="card">
        <h2>Triage</h2>
        <div>${escapeHtml(triage)}</div>
        ${redFlags.length ? `<div class="muted">Red flags:</div><ul>${redFlags.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<div class="muted">No red flags recorded.</div>`}
      </div>

      <div class="card">
        <h2>Next steps</h2>
        <div class="muted">This summary becomes available after provider sign-off.</div>
      </div>
    </body>
  </html>
  `;
}

export function saveSummaryHtml(caseId: string, html: string) {
  const dir = process.env.SUMMARY_DIR || path.join(process.cwd(), "summaries");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${caseId}.html`);
  fs.writeFileSync(p, html, "utf8");
  return p;
}
