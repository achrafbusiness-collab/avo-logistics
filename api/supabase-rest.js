const readRawBody = async (req) => {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return Buffer.concat(chunks).toString("utf-8");
};

const filterHeaders = (headers) => {
  const next = {};
  const allow = ["authorization", "apikey", "content-type", "accept", "prefer"];
  for (const key of allow) {
    if (headers?.[key]) next[key] = headers[key];
  }
  return next;
};

export default async function handler(req, res) {
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

  const path = req.headers["x-supabase-path"];
  if (!supabaseUrl || !path) {
    res.status(400).json({ error: "Missing supabase path or url" });
    return;
  }

  const forwardUrl = `${supabaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const method = req.method || "GET";
  const headers = filterHeaders(req.headers || {});

  let body = null;
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    body = await readRawBody(req);
  }

  try {
    const response = await fetch(forwardUrl, {
      method,
      headers,
      body: body || undefined,
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader("content-type", response.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Proxy failed" });
  }
}
