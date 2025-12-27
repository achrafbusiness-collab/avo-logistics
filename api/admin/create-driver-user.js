import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const smtpSecure =
  process.env.SMTP_SECURE === "true" || (smtpPort ? smtpPort === 465 : true);

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

const canSendEmail = () =>
  Boolean(smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom);

const sendEmail = async ({ to, subject, html, text }) => {
  if (!canSendEmail()) {
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });
  return true;
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

    const { email, profile, login_url } = await readJsonBody(req);
    if (!email) {
      res.status(400).json({ ok: false, error: "Missing email" });
      return;
    }

    const companyId = await getCompanyIdForUser(authData.user.id);
    if (!companyId) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfileError) {
      res.status(500).json({ ok: false, error: existingProfileError.message });
      return;
    }
    if (existingProfile?.id) {
      res.status(400).json({ ok: false, error: "E-Mail ist bereits vergeben." });
      return;
    }

    const tempPassword = crypto.randomBytes(8).toString("base64url");
    const { data: createUserData, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: profile?.full_name || "",
          company_id: companyId,
          role: "driver",
        },
      });

    if (createUserError || !createUserData?.user) {
      res.status(400).json({ ok: false, error: createUserError?.message || "User creation failed" });
      return;
    }

    const user = createUserData.user;
    await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || "",
      role: "driver",
      phone: profile?.phone || "",
      permissions: profile?.permissions || {},
      is_active: true,
      must_reset_password: true,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin
      .from("drivers")
      .update({ status: "pending" })
      .eq("email", email)
      .eq("company_id", companyId);

    const origin = req.headers.origin || "";
    const loginUrl = login_url || `${origin}/login/driver`;
    const subject = "Dein AVO Fahrer-Zugang";
    const text = `Hallo ${profile?.full_name || "Fahrer"},

dein Zugang zur AVO Fahrer-App wurde erstellt.

Login: ${loginUrl}
E-Mail: ${email}
Temporäres Passwort: ${tempPassword}

Nach dem ersten Login musst du dein Passwort ändern.
`;
    const html = `<p>Hallo ${profile?.full_name || "Fahrer"},</p>
<p>dein Zugang zur AVO Fahrer-App wurde erstellt.</p>
<p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
<p><strong>E-Mail:</strong> ${email}<br/>
<strong>Temporäres Passwort:</strong> ${tempPassword}</p>
<p>Nach dem ersten Login musst du dein Passwort ändern.</p>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({ to: email, subject, text, html });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({
      ok: true,
      data: {
        email,
        tempPassword,
        loginUrl,
        emailSent,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
