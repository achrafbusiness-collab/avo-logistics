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
const publicSiteUrl = process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || "";

const normalizePublicUrl = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const cleaned = trimmed.replace(/\/$/, "");
    if (cleaned.includes("localhost") || cleaned.includes("127.0.0.1")) {
      return "";
    }
    return cleaned;
  }
  const cleaned = `https://${trimmed.replace(/\/$/, "")}`;
  if (cleaned.includes("localhost") || cleaned.includes("127.0.0.1")) {
    return "";
  }
  return cleaned;
};

const buildAppLink = ({ baseUrl, email, otp, type }) => {
  if (!baseUrl || !otp || !type) return "";
  const params = new URLSearchParams();
  params.set("token", otp);
  params.set("type", type);
  if (email) params.set("email", email);
  return `${baseUrl.replace(/\/$/, "")}/reset-password?${params.toString()}`;
};

const ensureRedirect = (link, redirect) => {
  if (!link || !redirect) return link;
  try {
    const url = new URL(link);
    url.searchParams.set("redirect_to", redirect);
    return url.toString();
  } catch (error) {
    return link;
  }
};

const getAuthUserById = async (userId) => {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user || null;
  } catch (error) {
    return null;
  }
};

const getAuthUserByEmail = async (email) => {
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (error) return null;
    return data?.user || null;
  } catch (error) {
    return null;
  }
};

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

const canSendEmail = (config) =>
  Boolean(
    config?.host &&
      config?.port &&
      config?.user &&
      config?.pass &&
      (config?.from || config?.user)
  );

const buildFromAddress = ({ name, address, fallback }) => {
  if (!address) return fallback;
  if (!name) return address;
  const safeName = String(name).replace(/"/g, "");
  return `"${safeName}" <${address}>`;
};

const sendEmail = async ({ to, subject, html, text, replyTo, from, smtp }) => {
  if (!canSendEmail(smtp)) {
    throw new Error("SMTP ist nicht konfiguriert.");
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
  await transporter.sendMail({
    from: from || smtp.from || smtp.user,
    to,
    subject,
    text,
    html,
    replyTo,
  });
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
      .select("id, role, company_id, full_name, phone")
      .eq("email", email)
      .maybeSingle();
    if (existingProfileError) {
      res.status(500).json({ ok: false, error: existingProfileError.message });
      return;
    }
    if (existingProfile?.id) {
      if (existingProfile.company_id && existingProfile.company_id !== companyId) {
        res.status(400).json({ ok: false, error: "E-Mail ist bereits vergeben." });
        return;
      }
      if (existingProfile.role && existingProfile.role !== "driver") {
        res.status(400).json({ ok: false, error: "E-Mail ist bereits vergeben." });
        return;
      }
    }

    let user = existingProfile?.id ? await getAuthUserById(existingProfile.id) : null;
    let tempPassword = "";
    if (!user) {
      user = await getAuthUserByEmail(email);
    }

    if (!user) {
      tempPassword = crypto.randomBytes(12).toString("base64url");
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
      user = createUserData.user;
    }

    if (existingProfile?.id && user?.id && existingProfile.id !== user.id) {
      res.status(400).json({ ok: false, error: "E-Mail ist bereits vergeben." });
      return;
    }

    const profilePayload = {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || existingProfile?.full_name || "",
      role: "driver",
      phone: profile?.phone || existingProfile?.phone || "",
      permissions: profile?.permissions || {},
      is_active: true,
      must_reset_password: true,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin.from("profiles").upsert(profilePayload);

    await supabaseAdmin
      .from("drivers")
      .update({ status: "pending" })
      .eq("email", email)
      .eq("company_id", companyId);

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select(
        "email_sender_name, email_sender_address, support_email, company_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure"
      )
      .eq("company_id", companyId)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const normalizedPublicUrl =
      normalizePublicUrl(publicSiteUrl) || "https://avo-logistics.app";
    const effectiveRedirect = `${normalizedPublicUrl}/reset-password`;
    const loginUrl = login_url || `${normalizedPublicUrl}/login/driver`;

    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: effectiveRedirect },
    });

    const rawActionLink = linkData?.properties?.action_link || "";
    const emailOtp = linkData?.properties?.email_otp || "";
    const verificationType = linkData?.properties?.verification_type || "recovery";
    const appLink = buildAppLink({
      baseUrl: normalizedPublicUrl,
      email,
      otp: emailOtp,
      type: verificationType,
    });
    const actionLink = appLink || ensureRedirect(rawActionLink, effectiveRedirect);

    const companyName = settings?.company_name || "AVO Logistics";
    const senderName = settings?.email_sender_name || companyName;
    const senderAddress = settings?.email_sender_address || "";
    const resolvedSmtp = {
      host: settings?.smtp_host || smtpHost,
      port: settings?.smtp_port ? Number(settings.smtp_port) : smtpPort,
      user: settings?.smtp_user || smtpUser,
      pass: settings?.smtp_pass || smtpPass,
      secure:
        typeof settings?.smtp_secure === "boolean"
          ? settings.smtp_secure
          : settings?.smtp_secure
          ? String(settings.smtp_secure).toLowerCase() === "true"
          : smtpSecure,
      from: smtpFrom,
    };
    const fromAddress = buildFromAddress({
      name: senderName,
      address: senderAddress,
      fallback: resolvedSmtp.from || resolvedSmtp.user,
    });
    const replyTo = settings?.support_email || undefined;
    const brandPrimary = "#1e3a5f";
    const brandSecondary = "#2d5a8a";
    const logoUrl = "https://avo-logistics.app/IMG_5222.JPG";

    const subject = `Willkommen bei ${companyName}`;
    const text = `Hallo ${profile?.full_name || "Fahrer"},

herzlich willkommen bei ${companyName}. Dein Fahrer-Konto wurde erstellt.

Bitte richte jetzt dein Passwort ein:
${actionLink}

Login: ${loginUrl}
E-Mail: ${email}

Viele Grüße
${companyName}`;

    const html = `
<div style="background:#f4f6fb; padding:24px 0; font-family:Arial, sans-serif; color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px; margin:0 auto;">
    <tr>
      <td style="padding:0 20px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="text-align:left;">
              <img src="${logoUrl}" alt="${companyName}" style="height:46px; display:block; border-radius:8px;" />
            </td>
            <td style="text-align:right; font-size:12px; color:${brandSecondary}; font-weight:600;">
              Fahrerzugang
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px;">
        <div style="background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">
          <div style="background:${brandPrimary}; color:#ffffff; padding:18px 24px;">
            <h1 style="margin:0; font-size:20px; font-weight:700;">Herzlich willkommen!</h1>
            <p style="margin:6px 0 0; font-size:14px; opacity:0.9;">Dein Fahrer-Konto ist bereit.</p>
          </div>
          <div style="padding:20px 24px;">
            <p style="margin:0 0 12px; font-size:14px;">Bitte richte jetzt dein Passwort ein:</p>
            <p style="margin:0 0 16px;">
              <a href="${actionLink}" style="display:inline-block; background:${brandPrimary}; color:#ffffff; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:600;">
                Passwort einrichten
              </a>
            </p>
            <p style="margin:0 0 12px; font-size:12px; color:#64748b;">
              Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br/>
              <a href="${actionLink}" style="color:${brandSecondary};">${actionLink}</a>
            </p>
            <p style="margin:0; font-size:13px;">Login: <a href="${loginUrl}">${loginUrl}</a></p>
            <p style="margin:0; font-size:13px;">E-Mail: ${email}</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>`;

    let emailSent = false;
    let emailError = "";
    if (!canSendEmail(resolvedSmtp)) {
      emailError = "SMTP ist nicht konfiguriert. Bitte im Admin Controlling speichern.";
    } else {
      try {
        await sendEmail({
          to: email,
          subject,
          text,
          html,
          replyTo,
          from: fromAddress,
          smtp: resolvedSmtp,
        });
        emailSent = true;
      } catch (err) {
        emailSent = false;
        emailError = err?.message || "E-Mail konnte nicht gesendet werden.";
      }
    }

    res.status(200).json({
      ok: true,
      data: {
        email,
        loginUrl,
        resetLink: actionLink,
        emailSent,
        emailError,
        tempPassword: tempPassword || null,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
