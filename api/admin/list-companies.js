import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (req.method !== "GET") {
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

    const { data: companies, error: companiesError } = await supabaseAdmin
      .from("companies")
      .select("*")
      .order("created_at", { ascending: true });
    if (companiesError) {
      res.status(500).json({ ok: false, error: companiesError.message });
      return;
    }

    const ids = (companies || []).map((company) => company.id);
    const { data: ownerProfiles, error: ownersError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, full_name, email, phone, is_active, must_reset_password")
      .in("company_id", ids)
      .eq("role", "admin");

    if (ownersError) {
      res.status(500).json({ ok: false, error: ownersError.message });
      return;
    }

    const ownersByCompany = (ownerProfiles || []).reduce((acc, profile) => {
      if (!acc[profile.company_id]) {
        acc[profile.company_id] = profile;
      }
      return acc;
    }, {});

    const result = (companies || []).map((company) => ({
      ...company,
      owner_profile: ownersByCompany[company.id] || null,
    }));

    res.status(200).json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
