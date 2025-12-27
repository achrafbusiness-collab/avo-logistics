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

const isOwnerUser = async (userId, companyId) => {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("owner_user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.owner_user_id === userId;
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

    const ownerCompanyId = await getCompanyIdForUser(authData.user.id);
    if (!ownerCompanyId) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const isOwner = await isOwnerUser(authData.user.id, ownerCompanyId);
    if (!isOwner) {
      res.status(403).json({ ok: false, error: "Nicht erlaubt." });
      return;
    }

    const body = await readJsonBody(req);
    const { company_id } = body || {};
    if (!company_id) {
      res.status(400).json({ ok: false, error: "Missing company id" });
      return;
    }

    if (company_id === ownerCompanyId) {
      res.status(400).json({ ok: false, error: "Hauptunternehmen kann nicht gelöscht werden." });
      return;
    }

    const { data: companyProfiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("company_id", company_id);

    if (profilesError) {
      res.status(500).json({ ok: false, error: profilesError.message });
      return;
    }

    const profileIds = (companyProfiles || []).map((profile) => profile.id);

    await supabaseAdmin.from("orders").delete().eq("company_id", company_id);
    await supabaseAdmin.from("drivers").delete().eq("company_id", company_id);
    await supabaseAdmin.from("customers").delete().eq("company_id", company_id);
    await supabaseAdmin.from("checklists").delete().eq("company_id", company_id);
    await supabaseAdmin.from("app_settings").delete().eq("company_id", company_id);
    await supabaseAdmin.from("profiles").delete().eq("company_id", company_id);

    for (const userId of profileIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    const { error: deleteCompanyError } = await supabaseAdmin
      .from("companies")
      .delete()
      .eq("id", company_id);

    if (deleteCompanyError) {
      res.status(500).json({ ok: false, error: deleteCompanyError.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
