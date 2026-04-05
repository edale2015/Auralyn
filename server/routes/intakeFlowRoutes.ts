import { Router } from "express";
import { listEnabledComplaints } from "../services/complaintMatchService";
import { getRequiredQuestions } from "../services/questionFlowService";
import { buildTelegramMiniAppSchema } from "../integrations/telegramBot";
import { buildWhatsAppFlow } from "../integrations/whatsappFlow";
import { runOrchestratorTriage } from "../services/orchestratorTriageAdapter";

export const intakeFlowRouter = Router();

function mapAnswerType(at: string): "yes_no" | "single_select" | "free_text" {
  if (at === "number") return "single_select";
  if (at === "enum") return "single_select";
  return "yes_no";
}

intakeFlowRouter.get("/complaints", (_req, res) => {
  try {
    const all = listEnabledComplaints();
    res.json({
      complaints: all.map((c: any) => ({
        slug: c.CC_ID,
        label: c.LABEL,
        aliases: c.ALIASES ? c.ALIASES.split(";").map((a: string) => a.trim()).filter(Boolean) : [],
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

intakeFlowRouter.get("/telegram-flow/:complaintId", (req, res) => {
  try {
    const slug = req.params.complaintId;
    const questions = getRequiredQuestions(slug);

    if (!questions.length) {
      return res.status(404).json({ error: `No questions found for complaint: ${slug}` });
    }

    const complaints = listEnabledComplaints() as any[];
    const meta = complaints.find((c) => c.CC_ID === slug);
    const title = meta?.LABEL ?? slug.replace(/_/g, " ");

    const telegramQuestions = questions.map((q) => {
      const type = mapAnswerType(q.ANSWER_TYPE);
      let options: string[] | undefined;
      if (q.ANSWER_TYPE === "number") {
        options = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
      } else if (type === "yes_no") {
        options = ["Yes", "No"];
      }
      return { id: q.Q_ID, text: q.QUESTION_TEXT, type, options };
    });

    const schema = buildTelegramMiniAppSchema(slug, title, telegramQuestions);

    res.json({
      complaintSlug: slug,
      complaintLabel: title,
      questionCount: questions.length,
      schema,
      deepLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? "AuralynBot"}?start=${slug}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

intakeFlowRouter.get("/whatsapp-flow/:complaintId", (req, res) => {
  try {
    const slug = req.params.complaintId;
    const questions = getRequiredQuestions(slug);

    if (!questions.length) {
      return res.status(404).json({ error: `No questions found for complaint: ${slug}` });
    }

    const complaints = listEnabledComplaints() as any[];
    const meta = complaints.find((c) => c.CC_ID === slug);
    const title = meta?.LABEL ?? slug.replace(/_/g, " ");

    const waQuestions = questions.map((q) => {
      let options: string[] | undefined;
      if (q.ANSWER_TYPE === "number") {
        options = ["1 — Mild", "2", "3", "4", "5", "6", "7", "8", "9", "10 — Severe"];
      } else {
        options = ["Yes", "No"];
      }
      return { id: q.Q_ID, text: q.QUESTION_TEXT, options };
    });

    const flow = buildWhatsAppFlow(slug, title, waQuestions);

    res.json({
      complaintSlug: slug,
      complaintLabel: title,
      questionCount: questions.length,
      flow,
      twilioFormat: {
        note: "For Twilio WhatsApp, questions are delivered sequentially with numbered replies.",
        preview: waQuestions.slice(0, 3).map((q, i) => ({
          questionNumber: i + 1,
          message: `${q.text}\n\n${(q.options ?? []).map((o, j) => `${j + 1}️⃣ ${o}`).join("\n")}\n\nReply with a number.`,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

intakeFlowRouter.post("/submit", async (req, res) => {
  try {
    const { complaintSlug, answers } = req.body as {
      complaintSlug: string;
      answers: Record<string, unknown>;
    };

    if (!complaintSlug) return res.status(400).json({ error: "complaintSlug is required" });

    const triage = await runOrchestratorTriage({
      complaintSlug,
      answers: answers ?? {},
    });

    const dispositionLabel: Record<string, string> = {
      er_send: "Emergency — Go to ER",
      urgent_care: "Go to Urgent Care",
      pcp: "See Your Doctor",
      self_care: "Self-Care at Home",
    };

    res.json({
      disposition: triage.disposition,
      dispositionLabel: dispositionLabel[triage.disposition] ?? triage.disposition,
      topCluster: triage.topCluster,
      confidence: triage.confidence,
      rfTriggered: triage.rfTriggered ?? [],
      consistencyFlags: triage.consistencyFlags ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
