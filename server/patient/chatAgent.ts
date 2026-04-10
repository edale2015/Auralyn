let _openai: any = null;

function getOpenAI() {
  if (!_openai) {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI();
  }
  return _openai;
}

export async function patientChat(input: string): Promise<string> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful medical triage assistant. Be concise, empathetic, and always recommend seeking emergency care for symptoms like chest pain, difficulty breathing, or stroke signs. Never make a diagnosis — guide the patient to the right care level." },
      { role: "user", content: input },
    ],
    max_tokens: 400,
  });
  return res.choices[0]?.message?.content ?? "I'm unable to respond right now. Please call 911 if this is an emergency.";
}

export async function followupAgent(patient: { risk?: string; patientId?: string; [key: string]: unknown }): Promise<string> {
  if (patient.risk === "high") return "Call patient immediately";
  if (patient.risk === "medium") return "Send SMS check-in within 2 hours";
  return "Send SMS check-in within 24 hours";
}

export function careNavigator(patient: { risk?: string; [key: string]: unknown }): string {
  if (patient.risk === "high") return "ER";
  if (patient.risk === "medium") return "clinic";
  return "home + telemed";
}
