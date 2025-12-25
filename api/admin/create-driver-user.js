import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

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

const generatePassword = (length = 12) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
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

    const { email, profile, loginUrl } = await readJsonBody(req);
    if (!email) {
      res.status(400).json({ ok: false, error: "Missing email" });
      return;
    }

    const tempPassword = generatePassword();
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: profile?.full_name || "",
      },
    });

    if (createError || !createdUser?.user) {
      res.status(400).json({ ok: false, error: createError?.message || "User create failed" });
      return;
    }

    const user = createdUser.user;
    await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || "",
      role: "driver",
      phone: profile?.phone || "",
      permissions: profile?.permissions || {},
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    const subject = "Dein AVO Fahrer-Zugang";
    const safeLoginUrl = loginUrl || "";
    const text = `Hallo ${profile?.full_name || "Fahrer"},

dein Zugang zur AVO Fahrer-App wurde erstellt.

Login-Link: ${safeLoginUrl}
E-Mail: ${email}
Temporäres Passwort: ${tempPassword}

Bitte logge dich ein und ändere dein Passwort so bald wie möglich.
`;
    const html = `<p>Hallo ${profile?.full_name || "Fahrer"},</p>
<p>dein Zugang zur AVO Fahrer-App wurde erstellt.</p>
<p><strong>Login-Link:</strong> ${safeLoginUrl || "-"}<br/>
<strong>E-Mail:</strong> ${email}<br/>
<strong>Temporäres Passwort:</strong> ${tempPassword}</p>
<p>Bitte logge dich ein und ändere dein Passwort so bald wie möglich.</p>`;

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
        emailSent,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
