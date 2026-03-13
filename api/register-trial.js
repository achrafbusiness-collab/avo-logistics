import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TRIAL_DAYS = 14;

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: "Server configuration error" });
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await readJsonBody(req);
    const { full_name, company_name, email, password } = body || {};

    // Validierung
    if (!full_name || !company_name || !email || !password) {
      res.status(400).json({
        ok: false,
        error: "Bitte alle Felder ausfüllen.",
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (password.length < 8) {
      res.status(400).json({
        ok: false,
        error: "Passwort muss mindestens 8 Zeichen haben.",
      });
      return;
    }

    // Prüfen ob E-Mail bereits existiert
    const { data: existingUser } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser?.id) {
      res.status(400).json({
        ok: false,
        error: "Diese E-Mail ist bereits registriert.",
      });
      return;
    }

    // 1. Company anlegen (Trial)
    const companyId = crypto.randomUUID();
    const now = new Date();
    const trialExpires = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const { error: companyError } = await supabaseAdmin.from("companies").insert({
      id: companyId,
      name: company_name,
      owner_user_id: null,
      account_type: "trial",
      trial_started_at: now.toISOString(),
      trial_expires_at: trialExpires.toISOString(),
    });

    if (companyError) {
      res.status(500).json({ ok: false, error: companyError.message });
      return;
    }

    // 2. Auth-User anlegen
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          company_id: companyId,
          role: "admin",
        },
      });

    if (userError || !userData?.user) {
      // Rollback: Company löschen
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      res.status(400).json({
        ok: false,
        error: userError?.message || "Konto konnte nicht erstellt werden.",
      });
      return;
    }

    const userId = userData.user.id;

    // 3. Company owner setzen
    await supabaseAdmin
      .from("companies")
      .update({ owner_user_id: userId })
      .eq("id", companyId);

    // 4. Profil anlegen
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: normalizedEmail,
      full_name,
      role: "admin",
      permissions: {},
      is_active: true,
      must_reset_password: false,
      company_id: companyId,
      updated_at: now.toISOString(),
    });

    // 5. App-Settings anlegen
    await supabaseAdmin.from("app_settings").insert({
      company_id: companyId,
      company_name,
      created_date: now.toISOString(),
      updated_date: now.toISOString(),
    });

    res.status(200).json({
      ok: true,
      data: {
        company_id: companyId,
        user_id: userId,
        email: normalizedEmail,
        trial_expires_at: trialExpires.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unbekannter Fehler" });
  }
}
