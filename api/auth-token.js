const readRawBody = async (req) => {
  try {
    if (typeof req.body === "string") {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body.toString("utf-8");
    }
    if (req.body && typeof req.body === "object") {
      return JSON.stringify(req.body);
    }
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    if (!chunks.length) return "";
    return Buffer.concat(chunks).toString("utf-8");
  } catch (error) {
    console.warn("auth-token read body failed", error);
    return "";
  }
};

const buildForwardBody = (req, raw) => {
  const type = String(req?.headers?.["content-type"] || "").toLowerCase();
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    try {
      return new URLSearchParams(req.body).toString();
    } catch {
      return "";
    }
  }
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw || "{}");
      return new URLSearchParams(parsed).toString();
    } catch {
      return raw || "";
    }
  }
  return raw || "";
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const rawSupabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseUrl = (() => {
      const trimmed = String(rawSupabaseUrl || "").trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed.replace(/\/$/, "");
      }
      return `https://${trimmed.replace(/\/$/, "")}`;
    })();
    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_PUBLIC_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = anonKey || serviceRoleKey;

    if (!supabaseUrl || !apiKey) {
      res.status(500).json({
        error: "Supabase env vars missing",
        details: {
          hasUrl: Boolean(supabaseUrl),
          hasAnonKey: Boolean(anonKey),
          hasServiceRole: Boolean(serviceRoleKey),
        },
      });
      return;
    }

    const rawBody = await readRawBody(req);
    const forwardBody = buildForwardBody(req, rawBody);

    const incomingUrl = new URL(req.url || "/auth-token", "http://localhost");
    const grantType = incomingUrl.searchParams.get("grant_type") || "refresh_token";
    const forwardUrl = `${supabaseUrl.replace(/\\/$/, "")}/auth/v1/token?grant_type=${encodeURIComponent(
      grantType
    )}`;
    const response = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: forwardBody,
    });
    let data = null;
    let text = "";
    try {
      data = await response.json();
    } catch (err) {
      try {
        text = await response.text();
      } catch {
        text = "";
      }
    }
    if (data) {
      res.status(response.status).json(data);
      return;
    }
    res.status(response.status).send(text || "");
  } catch (error) {
    res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
