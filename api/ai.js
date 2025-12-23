const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

const extractText = (data) => {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output_text)) return data.output_text.join("");

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text") {
        parts.push(content.text);
      }
    }
  }
  if (parts.length) return parts.join("");

  if (Array.isArray(data.choices)) {
    const choiceText = data.choices
      .map((choice) => choice.message?.content || choice.text)
      .filter(Boolean)
      .join("");
    if (choiceText) return choiceText;
  }
  return "";
};

const parseJsonFromText = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  }
  return null;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const { prompt, response_json_schema } = await readJsonBody(req);
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ ok: false, error: "Missing prompt" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set" });
      return;
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const body = {
      model,
      input: prompt,
      temperature: response_json_schema ? 0.2 : 0.6,
    };

    if (response_json_schema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "avo_ai_response",
          schema: response_json_schema,
          strict: false,
        },
      };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "OpenAI request failed";
      res.status(500).json({ ok: false, error: message });
      return;
    }

    const text = extractText(data);
    if (response_json_schema) {
      const parsed = parseJsonFromText(text);
      if (!parsed) {
        res.status(500).json({ ok: false, error: "Failed to parse JSON response" });
        return;
      }
      res.status(200).json({ ok: true, data: parsed });
      return;
    }

    res.status(200).json({ ok: true, data: text || "Keine Antwort erhalten." });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
