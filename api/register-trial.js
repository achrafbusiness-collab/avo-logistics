import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
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
const publicSiteUrl = process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || "";

const TRIAL_DAYS = 14;

const normalizePublicUrl = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const cleaned = trimmed.replace(/\/$/, "");
    if (cleaned.includes("localhost") || cleaned.includes("127.0.0.1")) return "";
    return cleaned;
  }
  const cleaned = `https://${trimmed.replace(/\/$/, "")}`;
  if (cleaned.includes("localhost") || cleaned.includes("127.0.0.1")) return "";
  return cleaned;
};

const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) {
    pw += chars[crypto.randomInt(chars.length)];
  }
  return pw;
};

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

const sendEmail = async ({ to, subject, text, html, from, smtp }) => {
  if (!smtp.host || !smtp.user || !smtp.pass) return false;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 465,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transporter.sendMail({ from, to, subject, text, html });
  return true;
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
    const { full_name, company_name, phone, email } = body || {};

    // Validierung
    if (!full_name || !company_name || !email || !phone) {
      res.status(400).json({
        ok: false,
        error: "Bitte alle Felder ausfüllen.",
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

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

    // Temporäres Passwort generieren
    const tempPassword = generateTempPassword();

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

    // 2. Auth-User anlegen mit temporärem Passwort
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
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

    // 4. Profil anlegen (must_reset_password = true)
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: normalizedEmail,
      full_name,
      phone: phone || "",
      role: "admin",
      permissions: {},
      is_active: true,
      must_reset_password: true,
      company_id: companyId,
      updated_at: now.toISOString(),
    });

    // 5. App-Settings anlegen
    await supabaseAdmin.from("app_settings").insert({
      company_id: companyId,
      company_name,
      support_phone: phone,
      created_date: now.toISOString(),
      updated_date: now.toISOString(),
    });

    // 6. Willkommens-E-Mail senden
    const normalizedPublicUrl = normalizePublicUrl(publicSiteUrl);
    const loginUrl = normalizedPublicUrl ? `${normalizedPublicUrl}/login` : "https://transferfleet.de/login";
    const logoUrl = normalizedPublicUrl ? `${normalizedPublicUrl}/logo-dark.png` : "";
    const brandPrimary = "#1e3a5f";
    const brandSecondary = "#2d5a8a";
    const trialEndFormatted = trialExpires.toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    const subject = `Willkommen bei TransferFleet — Ihre Zugangsdaten`;
    const text = `Hallo ${full_name},

willkommen bei TransferFleet! Ihr 14-tägiger Testzugang wurde erstellt.

Firma: ${company_name}
E-Mail: ${normalizedEmail}
Temporäres Passwort: ${tempPassword}

Bitte melden Sie sich an und ändern Sie Ihr Passwort:
${loginUrl}

Ihre Testphase läuft bis zum ${trialEndFormatted}.

Bei Fragen erreichen Sie uns unter info@transferfleet.de

Viele Grüße,
Ihr TransferFleet Team`;

    const html = `
<div style="background:#f4f6fb; padding:24px 0; font-family:Arial, sans-serif; color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px; margin:0 auto;">
    <tr>
      <td style="padding:0 20px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="text-align:left;">
              ${logoUrl ? `<img src="${logoUrl}" alt="TransferFleet" style="height:46px; display:block; border-radius:8px;" />` : ""}
            </td>
            <td style="text-align:right; font-size:12px; color:${brandSecondary}; font-weight:600;">
              Willkommen
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px;">
        <div style="background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">
          <div style="background:${brandPrimary}; color:#ffffff; padding:24px;">
            <h1 style="margin:0; font-size:22px; font-weight:700;">Willkommen bei TransferFleet!</h1>
            <p style="margin:8px 0 0; font-size:14px; opacity:0.9;">Hallo ${full_name}, Ihr Testzugang ist bereit.</p>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 16px; font-size:14px;">Ihr 14-tägiger kostenloser Testzugang wurde erfolgreich erstellt. Hier sind Ihre Zugangsdaten:</p>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:0 0 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding:4px 0; font-size:13px; color:#64748b; width:140px;">Firma:</td>
                  <td style="padding:4px 0; font-size:13px; font-weight:600;">${company_name}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:13px; color:#64748b;">E-Mail:</td>
                  <td style="padding:4px 0; font-size:13px; font-weight:600;">${normalizedEmail}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:13px; color:#64748b;">Temporäres Passwort:</td>
                  <td style="padding:4px 0; font-size:14px; font-weight:700; font-family:monospace; color:${brandPrimary}; letter-spacing:1px;">${tempPassword}</td>
                </tr>
              </table>
            </div>

            <p style="margin:0 0 8px; font-size:14px; font-weight:600;">Nächste Schritte:</p>
            <ol style="margin:0 0 20px; padding-left:20px; font-size:13px; color:#475569; line-height:1.8;">
              <li>Klicken Sie auf den Button unten</li>
              <li>Melden Sie sich mit Ihren Zugangsdaten an</li>
              <li>Ändern Sie Ihr Passwort nach dem ersten Login</li>
              <li>Richten Sie Ihr Unternehmen ein und legen Sie los!</li>
            </ol>

            <p style="margin:0 0 20px; text-align:center;">
              <a href="${loginUrl}" style="display:inline-block; background:${brandPrimary}; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:10px; font-weight:700; font-size:15px;">
                Jetzt anmelden →
              </a>
            </p>

            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px 16px; margin:0 0 16px;">
              <p style="margin:0; font-size:13px; color:#065f46;">
                ✦ Ihre Testphase läuft bis zum <strong>${trialEndFormatted}</strong> — alle Funktionen sind freigeschaltet.
              </p>
            </div>

            <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center;">
              Bei Fragen erreichen Sie uns unter <a href="mailto:info@transferfleet.de" style="color:${brandSecondary};">info@transferfleet.de</a>
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>`;

    // SMTP-Settings aus bestehender Company lesen (Owner/Admin-SMTP)
    const { data: existingSettings } = await supabaseAdmin
      .from("app_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, email_sender_name, email_sender_address")
      .not("smtp_host", "is", null)
      .not("smtp_user", "is", null)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const smtp = {
      host: existingSettings?.smtp_host || smtpHost,
      port: existingSettings?.smtp_port ? Number(existingSettings.smtp_port) : smtpPort,
      user: existingSettings?.smtp_user || smtpUser,
      pass: existingSettings?.smtp_pass || smtpPass,
      secure: existingSettings?.smtp_secure != null
        ? String(existingSettings.smtp_secure).toLowerCase() === "true"
        : smtpSecure,
    };

    const senderAddress = existingSettings?.email_sender_address || smtp.user || smtpFrom;
    const senderName = existingSettings?.email_sender_name || "TransferFleet";

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: normalizedEmail,
        subject,
        text,
        html,
        from: `${senderName} <${senderAddress}>`,
        smtp,
      });
    } catch (err) {
      emailSent = false;
    }

    // Admin-Benachrichtigung bei neuer Registrierung
    const adminNotifyEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "info@transferfleet.de";
    try {
      await sendEmail({
        to: adminNotifyEmail,
        subject: `Neue Trial-Registrierung: ${companyName}`,
        text: `Neuer Trial-Kunde:\n\nFirma: ${companyName}\nName: ${fullName}\nE-Mail: ${normalizedEmail}\nTelefon: ${phone || "-"}\nTrial bis: ${trialEndFormatted}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px;">
            <div style="background: linear-gradient(135deg, #1e3a5f, #2d5a8a); padding: 20px; border-radius: 10px 10px 0 0;">
              <h2 style="color: #fff; margin: 0; font-size: 18px;">Neue Trial-Registrierung</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 10px 10px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666;">Firma</td><td style="padding: 6px 0; font-weight: bold;">${companyName}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Name</td><td style="padding: 6px 0; font-weight: bold;">${fullName}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">E-Mail</td><td style="padding: 6px 0; font-weight: bold;">${normalizedEmail}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Telefon</td><td style="padding: 6px 0; font-weight: bold;">${phone || "-"}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Trial bis</td><td style="padding: 6px 0; font-weight: bold;">${trialEndFormatted}</td></tr>
              </table>
              <div style="margin-top: 16px;">
                <a href="https://app.transferfleet.de/SystemVermietung" style="background: #1e3a5f; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px;">Im Dashboard ansehen →</a>
              </div>
            </div>
          </div>
        `,
        from: `TransferFleet System <${senderAddress}>`,
        smtp,
      });
    } catch {
      // Admin-Notification ist optional
    }

    res.status(200).json({
      ok: true,
      data: {
        company_id: companyId,
        user_id: userId,
        email: normalizedEmail,
        trial_expires_at: trialExpires.toISOString(),
        emailSent,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unbekannter Fehler" });
  }
}
