import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL;
const systemAdminUserId = process.env.SYSTEM_ADMIN_USER_ID;

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

    const isOwner = await isSystemAdmin(authData.user);
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

    if (!companies || companies.length === 0) {
      res.status(200).json({ ok: true, data: [] });
      return;
    }

    const ids = (companies || []).map((company) => company.id);
    const { data: ownerProfiles, error: ownersError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, full_name, email, phone, role, is_active, must_reset_password")
      .in("company_id", ids)
      .eq("role", "admin");

    if (ownersError) {
      res.status(500).json({ ok: false, error: ownersError.message });
      return;
    }

    const { data: companyProfiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, full_name, email, role, is_active, must_reset_password")
      .in("company_id", ids);

    if (profilesError) {
      res.status(500).json({ ok: false, error: profilesError.message });
      return;
    }

    const { data: companyDrivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, company_id")
      .in("company_id", ids);

    if (driversError) {
      res.status(500).json({ ok: false, error: driversError.message });
      return;
    }

    const ownersByCompany = (ownerProfiles || []).reduce((acc, profile) => {
      if (!acc[profile.company_id]) {
        acc[profile.company_id] = profile;
      }
      return acc;
    }, {});

    const profilesByCompany = (companyProfiles || []).reduce((acc, profile) => {
      if (!acc[profile.company_id]) {
        acc[profile.company_id] = [];
      }
      acc[profile.company_id].push(profile);
      return acc;
    }, {});

    const driversByCompany = (companyDrivers || []).reduce((acc, driver) => {
      if (!acc[driver.company_id]) {
        acc[driver.company_id] = [];
      }
      acc[driver.company_id].push(driver);
      return acc;
    }, {});

    const result = (companies || []).map((company) => ({
      ...company,
      owner_profile: ownersByCompany[company.id] || null,
      profiles: profilesByCompany[company.id] || [],
      employee_count: (profilesByCompany[company.id] || []).filter(
        (profile) => profile.role !== "driver"
      ).length,
      driver_count: (driversByCompany[company.id] || []).length,
    }));

    res.status(200).json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
