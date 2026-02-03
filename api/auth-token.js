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
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
};

const extractRefreshToken = (body) => {
  if (!body) return "";
  if (typeof body.refresh_token === "string") return body.refresh_token;
  if (typeof body._raw === "string") {
    const params = new URLSearchParams(body._raw);
    return params.get("refresh_token") || "";
  }
  return "";
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = anonKey || serviceRoleKey;

  if (!supabaseUrl || !apiKey) {
    res.status(500).json({ error: "Supabase env vars missing" });
    return;
  }

  const body = await readJsonBody(req);
  const refreshToken = extractRefreshToken(body);
  if (!refreshToken) {
    res.status(400).json({ error: "Missing refresh_token" });
    return;
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\\/$/, "")}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Unknown error" });
  }
}
