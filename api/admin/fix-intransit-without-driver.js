import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const systemAdminUserId =
  process.env.SYSTEM_ADMIN_USER_ID || process.env.VITE_SYSTEM_ADMIN_USER_ID;
const systemAdminEmail =
  process.env.SYSTEM_ADMIN_EMAIL || process.env.VITE_SYSTEM_ADMIN_EMAIL;

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isSystemAdmin = (profile) => {
  if (!profile) return false;
  if (systemAdminUserId && profile.id === systemAdminUserId) return true;
  if (systemAdminEmail && normalizeEmail(profile.email) === normalizeEmail(systemAdminEmail)) {
    return true;
  }
  return false;
};

const getProfileForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
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

    const profile = await getProfileForUser(authData.user.id);
    if (!profile?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const canRun = profile.role === "admin" || isSystemAdmin(profile);
    if (!canRun) {
      res.status(403).json({ ok: false, error: "Keine Berechtigung." });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "zwischenabgabe", assigned_driver_name: "" })
      .eq("company_id", profile.company_id)
      .is("assigned_driver_id", null)
      .eq("status", "in_transit")
      .select("id");

    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true, updated: data?.length || 0 });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
