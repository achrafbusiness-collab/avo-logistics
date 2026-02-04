const readRawBody = async (req) => {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return "";
  return Buffer.concat(chunks).toString("utf-8");
};

const buildForwardBody = (req, rawBody) => {
  const type = String(req?.headers?.["content-type"] || "").toLowerCase();
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    if (type.includes("application/x-www-form-urlencoded")) {
      return new URLSearchParams(req.body).toString();
    }
    if (type.includes("application/json")) {
      return JSON.stringify(req.body);
    }
  }
  return rawBody || "";
};

const filterHeaders = (headers) => {
  const next = {};
  const allow = ["authorization", "apikey", "content-type", "accept", "x-client-info"];
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

  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_PUBLIC_KEY;

  const path = req.headers["x-supabase-path"];
  if (!supabaseUrl || !path) {
    res.status(400).json({ error: "Missing supabase path or url" });
    return;
  }

  const forwardUrl = `${supabaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const method = req.method || "GET";
  const headers = filterHeaders(req.headers || {});
  if (!headers.apikey && anonKey) {
    headers.apikey = anonKey;
  }
  if (!headers.authorization && anonKey) {
    headers.authorization = `Bearer ${anonKey}`;
  }

  let body = null;
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    const rawBody = await readRawBody(req);
    body = buildForwardBody(req, rawBody);
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
