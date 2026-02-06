import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");
const getCompanyIdForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.company_id || null;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: "Supabase admin env vars missing" });
    return;
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "Missing auth token" });
      return;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ ok: false, error: "Invalid auth token" });
      return;
    }

    const body = await readJsonBody(req);
    const { id } = body || {};
    if (!id) {
      res.status(400).json({ ok: false, error: "Missing user id" });
      return;
    }

    const requesterCompanyId = await getCompanyIdForUser(authData.user.id);
    if (!requesterCompanyId) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, company_id")
      .eq("id", id)
      .maybeSingle();

    if (!profile || profile.company_id !== requesterCompanyId) {
      res.status(403).json({ ok: false, error: "Nicht erlaubt." });
      return;
    }

    if (profile?.email) {
      await supabaseAdmin
        .from("drivers")
        .delete()
        .eq("email", profile.email)
        .eq("company_id", requesterCompanyId);
    }

    await supabaseAdmin.from("profiles").delete().eq("id", id).eq("company_id", requesterCompanyId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
