import OpenAI from "openai";
const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
console.log("key present:", !!key, "len:", key?.length, "baseURL:", baseURL ?? "(default)");
(async () => {
  try {
    const client = new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: 'Reply with the single word: pong' }],
      max_tokens: 5, temperature: 0,
    });
    console.log("OPENAI OK ->", JSON.stringify(r.choices[0]?.message?.content));
  } catch (e:any) {
    console.error("OPENAI ERROR:", e?.status, e?.message?.slice(0,200));
  }
  process.exit(0);
})();
