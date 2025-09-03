// Minimal LLM wrapper for Google Gemini via Google AI Studio (Generative Language API)
// Env-driven: GOOGLE_API_KEY, GOOGLE_MODEL, LLM_MAX_TOKENS, LLM_TEMPERATURE

const DEFAULTS = {
  googleModel: process.env.GOOGLE_MODEL || "gemini-1.5-pro",
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "600", 10),
  temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
};

export async function generateLLMReply({ system, messages, model, maxTokens = DEFAULTS.maxTokens, temperature = DEFAULTS.temperature }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY");
  const usedModel = model || DEFAULTS.googleModel; // e.g., gemini-1.5-pro
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(usedModel)}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google (Gemini) error ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("\n").trim();
  return text;
}
