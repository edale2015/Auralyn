import { openai } from "../../replit_integrations/audio/client";
import { applyPHIGuard } from "../../middleware/phiGuardOpenAI";

export interface ChartSection {
  title: string;
  content: string;
}

const SYSTEM_PROMPT = `You are a clinical documentation specialist generating structured clinical chart sections from a triage case.
Given the patient case data, produce well-formed, concise clinical note sections.
Respond ONLY with valid JSON:
{
  "sections": [
    { "title": "string", "content": "string" }
  ]
}
Required sections (in order): Chief Complaint, History of Present Illness, Review of Systems, Assessment and Plan, Differential Diagnosis, Red Flags Identified, Recommended Disposition.
Keep each section clinically precise and professionally written.`;

export async function buildChartSections(caseData: any): Promise<ChartSection[]> {
  try {
    const summary = {
      complaintId: caseData?.complaintId,
      answers: caseData?.answers,
      engineResult: {
        disposition: caseData?.engineResult?.recommendedDisposition,
        topDx: caseData?.engineResult?.dxCandidates?.slice(0, 3),
        redFlags: caseData?.engineResult?.triggeredRedFlags,
        confidence: caseData?.engineResult?.confidence,
      },
      noteDraft: caseData?.noteDraft,
    };

    const rawParams: any = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate clinical chart sections for this case:\n${JSON.stringify(summary, null, 2)}` },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    };
    const safeParams = applyPHIGuard(rawParams, "msChartAgent");
    const response = await openai.chat.completions.create(safeParams);

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from OpenAI");

    const parsed = JSON.parse(raw);
    const sections: ChartSection[] = Array.isArray(parsed.sections) ? parsed.sections : [];
    if (sections.length === 0) throw new Error("No sections returned");
    return sections;
  } catch (err: any) {
    console.error("[ChartAgent] OpenAI error, using fallback:", err?.message);
    return buildFallbackSections(caseData);
  }
}

function buildFallbackSections(caseData: any): ChartSection[] {
  const sections: ChartSection[] = [];
  sections.push({ title: "Chief Complaint", content: caseData?.complaintId?.replace(/_/g, " ") || "Not specified" });

  const answers = caseData?.answers ?? {};
  const hpiParts = Object.entries(answers).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  sections.push({ title: "History of Present Illness", content: hpiParts.join(". ") || "History not recorded." });

  const engine = caseData?.engineResult;
  if (engine) {
    sections.push({ title: "Assessment and Plan", content: `Recommended disposition: ${engine.recommendedDisposition || "Pending evaluation"}.` });
    if (engine.dxCandidates?.length) {
      sections.push({ title: "Differential Diagnosis", content: engine.dxCandidates.map((d: any) => `${d.clusterId} (score: ${d.score})`).join("; ") });
    }
    if (engine.triggeredRedFlags?.length) {
      sections.push({ title: "Red Flags Identified", content: engine.triggeredRedFlags.join(", ") });
    }
  }

  sections.push({ title: "Recommended Disposition", content: engine?.recommendedDisposition || "Requires physician evaluation" });
  return sections;
}
