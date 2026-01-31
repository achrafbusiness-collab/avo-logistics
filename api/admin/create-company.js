import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL;
const systemAdminUserId = process.env.SYSTEM_ADMIN_USER_ID;

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

    const isOwner = await isSystemAdmin(authData.user);
    if (!isOwner) {
      res.status(403).json({ ok: false, error: "Nicht erlaubt." });
      return;
    }

    const body = await readJsonBody(req);
    const { company_name, owner_full_name, owner_email, owner_phone, login_url } = body || {};
    if (!company_name || !owner_full_name || !owner_email) {
      res.status(400).json({ ok: false, error: "Missing required fields" });
      return;
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", owner_email)
      .maybeSingle();
    if (existingProfileError) {
      res.status(500).json({ ok: false, error: existingProfileError.message });
      return;
    }
    if (existingProfile?.id) {
      res.status(400).json({ ok: false, error: "E-Mail ist bereits vergeben." });
      return;
    }

    const companyId = crypto.randomUUID();
    const { error: companyInsertError } = await supabaseAdmin
      .from("companies")
      .insert({
        id: companyId,
        name: company_name,
        owner_user_id: null,
      });

    if (companyInsertError) {
      res.status(500).json({ ok: false, error: companyInsertError.message });
      return;
    }

    const tempPassword = crypto.randomBytes(8).toString("base64url");
    const { data: createUserData, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email: owner_email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: owner_full_name,
          company_id: companyId,
          role: "admin",
        },
      });

    if (createUserError || !createUserData?.user) {
      await supabaseAdmin.from("app_settings").delete().eq("company_id", companyId);
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      res.status(400).json({ ok: false, error: createUserError?.message || "User creation failed" });
      return;
    }

    const ownerUser = createUserData.user;

    const { data: company, error: updateCompanyError } = await supabaseAdmin
      .from("companies")
      .update({ owner_user_id: ownerUser.id })
      .eq("id", companyId)
      .select("*")
      .single();

    if (updateCompanyError) {
      res.status(500).json({ ok: false, error: updateCompanyError.message });
      return;
    }

    await supabaseAdmin.from("profiles").upsert({
      id: ownerUser.id,
      email: ownerUser.email,
      full_name: owner_full_name,
      role: "admin",
      phone: owner_phone || "",
      permissions: {},
      is_active: true,
      must_reset_password: true,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from("app_settings").insert({
      company_id: companyId,
      company_name,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });

    const origin = req.headers.origin || "";
    const loginUrl = login_url || `${origin}/login/executive`;
    const subject = "Dein AVO System Zugang";
    const text = `Hallo ${owner_full_name},

du hast einen neuen AVO System Mandanten erhalten: ${company_name}

Login: ${loginUrl}
E-Mail: ${owner_email}
Temporäres Passwort: ${tempPassword}

Nach dem ersten Login musst du dein Passwort ändern.
`;
    const html = `<p>Hallo ${owner_full_name},</p>
<p>du hast einen neuen AVO System Mandanten erhalten: <strong>${company_name}</strong></p>
<p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
<p><strong>E-Mail:</strong> ${owner_email}<br/>
<strong>Temporäres Passwort:</strong> ${tempPassword}</p>
<p>Nach dem ersten Login musst du dein Passwort ändern.</p>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({ to: owner_email, subject, text, html });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({
      ok: true,
      data: {
        company_id: companyId,
        company_name,
        owner_email,
        tempPassword,
        loginUrl,
        emailSent,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
