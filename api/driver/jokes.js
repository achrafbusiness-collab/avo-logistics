import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");
const JOKES_BUCKET = "documents";
const MAX_POSTS = 200;

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const readRawBody = async (req) => {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  let body = "";
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      body += chunk;
      continue;
    }
    if (chunk instanceof Uint8Array) {
      body += new TextDecoder("utf-8").decode(chunk);
      continue;
    }
    body += String(chunk || "");
  }
  return body;
};

const parseJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const getUserAndProfile = async (token) => {
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    throw new Error("Invalid auth token");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, full_name, email")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.company_id) {
    throw new Error("Profile not found");
  }

  return { user: authData.user, profile };
};

const getFilePath = (companyId) => `driver-fun/${companyId}/jokes.json`;

const loadJokes = async (companyId) => {
  const path = getFilePath(companyId);
  const { data, error } = await supabaseAdmin.storage.from(JOKES_BUCKET).download(path);
  if (error || !data) {
    return [];
  }

  try {
    const text = await data.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ""),
        text: String(item?.text || "").trim(),
        author_id: String(item?.author_id || ""),
        author_name: String(item?.author_name || "").trim(),
        created_at: String(item?.created_at || ""),
      }))
      .filter((item) => item.id && item.text)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  } catch {
    return [];
  }
};

const saveJokes = async (companyId, jokes) => {
  const path = getFilePath(companyId);
  const payload = JSON.stringify(jokes, null, 2);
  const body = new TextEncoder().encode(payload);
  const { error } = await supabaseAdmin.storage.from(JOKES_BUCKET).upload(path, body, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) {
    throw new Error(error.message || "Could not save jokes");
  }
};

export default async function handler(req, res) {
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: "Missing server config" });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Missing auth token" });
    return;
  }

  try {
    const { user, profile } = await getUserAndProfile(token);
    const companyId = profile.company_id;

    if (req.method === "GET") {
      const jokes = await loadJokes(companyId);
      res.status(200).json({ ok: true, data: jokes });
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      const rawText = String(body?.text || "");
      const text = rawText.replace(/\s+/g, " ").trim();
      if (!text) {
        res.status(400).json({ ok: false, error: "Text is required" });
        return;
      }
      if (text.length > 240) {
        res.status(400).json({ ok: false, error: "Text is too long" });
        return;
      }

      const jokes = await loadJokes(companyId);
      const next = [
        {
          id: crypto.randomUUID(),
          text,
          author_id: user.id,
          author_name: (profile.full_name || profile.email || "Fahrer").trim(),
          created_at: new Date().toISOString(),
        },
        ...jokes,
      ].slice(0, MAX_POSTS);

      await saveJokes(companyId, next);
      res.status(200).json({ ok: true, data: next });
      return;
    }

    if (req.method === "DELETE") {
      const body = await parseJsonBody(req);
      const id = String(body?.id || "").trim();
      if (!id) {
        res.status(400).json({ ok: false, error: "Id is required" });
        return;
      }

      const jokes = await loadJokes(companyId);
      const next = jokes.filter((item) => item.id !== id);
      await saveJokes(companyId, next);
      res.status(200).json({ ok: true, data: next });
      return;
    }

    res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
