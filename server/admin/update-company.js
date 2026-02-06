import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL;
const systemAdminUserId = process.env.SYSTEM_ADMIN_USER_ID;

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

const allowedCompanyFields = new Set([
  "name",
  "vat_id",
  "billing_address",
  "billing_city",
  "billing_postal_code",
  "billing_country",
  "contact_name",
  "contact_email",
  "contact_phone",
  "is_active",
]);

const allowedOwnerFields = new Set(["full_name", "phone", "is_active"]);

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
    const { company_id, updates, owner_profile } = body || {};
    if (!company_id || !updates) {
      res.status(400).json({ ok: false, error: "Missing company data" });
      return;
    }

    const sanitizedCompany = Object.entries(updates).reduce((acc, [key, value]) => {
      if (allowedCompanyFields.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const { data: updatedCompany, error: updateError } = await supabaseAdmin
      .from("companies")
      .update(sanitizedCompany)
      .eq("id", company_id)
      .select("*")
      .single();
    if (updateError) {
      res.status(500).json({ ok: false, error: updateError.message });
      return;
    }

    if (typeof updates.is_active === "boolean") {
      await supabaseAdmin
        .from("profiles")
        .update({ is_active: updates.is_active })
        .eq("company_id", company_id);
    }

    if (owner_profile && typeof owner_profile === "object") {
      const sanitizedOwner = Object.entries(owner_profile).reduce((acc, [key, value]) => {
        if (allowedOwnerFields.has(key)) {
          acc[key] = value;
        }
        return acc;
      }, {});
      if (Object.keys(sanitizedOwner).length) {
        await supabaseAdmin
          .from("profiles")
          .update(sanitizedOwner)
          .eq("company_id", company_id)
          .eq("role", "admin");
      }
    }

    res.status(200).json({ ok: true, data: updatedCompany });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
