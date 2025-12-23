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

    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (requesterProfile?.role !== "admin") {
      res.status(403).json({ ok: false, error: "Not allowed" });
      return;
    }

    const { email, profile, redirectTo } = await readJsonBody(req);
    if (!email) {
      res.status(400).json({ ok: false, error: "Missing email" });
      return;
    }

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });

    if (inviteError) {
      res.status(400).json({ ok: false, error: inviteError.message });
      return;
    }

    const invitedUser = inviteData?.user;
    if (invitedUser) {
      const profileData = {
        id: invitedUser.id,
        email: invitedUser.email,
        full_name: profile?.full_name || "",
        role: profile?.role || "minijobber",
        position: profile?.position || "",
        employment_type: profile?.employment_type || "",
        address: profile?.address || "",
        phone: profile?.phone || "",
        permissions: profile?.permissions || {},
        is_active: profile?.is_active ?? true,
        updated_at: new Date().toISOString(),
      };

      await supabaseAdmin.from("profiles").upsert(profileData);
    }

    res.status(200).json({ ok: true, data: inviteData });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
