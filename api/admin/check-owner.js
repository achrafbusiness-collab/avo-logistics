import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      res.status(500).json({ ok: false, error: profileError.message });
      return;
    }

    if (!profile?.company_id) {
      res.status(200).json({ ok: true, isOwner: false });
      return;
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("owner_user_id")
      .eq("id", profile.company_id)
      .maybeSingle();
    if (companyError) {
      res.status(500).json({ ok: false, error: companyError.message });
      return;
    }

    const isOwner = company?.owner_user_id === authData.user.id;
    res.status(200).json({ ok: true, isOwner });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
