import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL;
const systemAdminUserId = process.env.SYSTEM_ADMIN_USER_ID;
const systemCompanyId = process.env.SYSTEM_COMPANY_ID;

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

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getSystemCompanyRecord = async () => {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, owner_user_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
};

const isSystemAdmin = async (user) => {
  if (!user) return false;
  if (systemAdminUserId && user.id === systemAdminUserId) return true;
  if (systemAdminEmail && normalizeEmail(user.email) === normalizeEmail(systemAdminEmail)) {
    return true;
  }
  if (!systemAdminUserId && !systemAdminEmail) {
    const systemCompany = await getSystemCompanyRecord();
    return systemCompany?.owner_user_id ? user.id === systemCompany.owner_user_id : false;
  }
  return false;
};

const resolveSystemCompanyId = async () => {
  if (systemCompanyId) return systemCompanyId;
  const systemCompany = await getSystemCompanyRecord();
  return systemCompany?.id || null;
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

    const isOwner = await isSystemAdmin(authData.user);
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

    const resolvedSystemCompanyId = await resolveSystemCompanyId();
    if (!resolvedSystemCompanyId) {
      res.status(500).json({ ok: false, error: "System-Unternehmen nicht konfiguriert." });
      return;
    }

    if (company_id === resolvedSystemCompanyId) {
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
