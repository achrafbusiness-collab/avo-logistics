import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tokenSecret = process.env.LICENSE_TOKEN_SECRET;

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const base64Url = (value) =>
  Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey || !tokenSecret) {
    res.status(500).json({ ok: false, error: "Missing server config" });
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
      .select("company_id, role, full_name, email")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      res.status(400).json({ ok: false, error: "Profile not found" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const payload = JSON.stringify({
      uid: authData.user.id,
      company_id: profile.company_id,
      role: profile.role,
      day: today,
    });
    const payloadEncoded = base64Url(payload);
    const signature = crypto.createHmac("sha256", tokenSecret).update(payloadEncoded).digest("base64");
    const signatureEncoded = signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const signedToken = `${payloadEncoded}.${signatureEncoded}`;

    res.status(200).json({
      ok: true,
      data: {
        token: signedToken,
        day: today,
        owner: profile.full_name || profile.email,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
