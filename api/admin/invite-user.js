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
    return false;
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

    const { email, profile, redirectTo } = await readJsonBody(req);
    if (!email) {
      res.status(400).json({ ok: false, error: "Missing email" });
      return;
    }

    const companyId = await getCompanyIdForUser(authData.user.id);
    if (!companyId) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select(
        "email_sender_name, email_sender_address, support_email, company_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure"
      )
      .eq("company_id", companyId)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          full_name: profile?.full_name || "",
          company_id: companyId,
        },
      },
    });

    if (linkError || !linkData?.user) {
      res.status(400).json({ ok: false, error: linkError?.message || "Invite link failed" });
      return;
    }

    const invitedUser = linkData.user;
    const actionLink = linkData.properties?.action_link || "";
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
        is_active: profile?.is_active ?? false,
        company_id: companyId,
        updated_at: new Date().toISOString(),
      };

      await supabaseAdmin.from("profiles").upsert(profileData);
    }

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

    const subject = `Dein ${companyName} Zugang`;
    const text = `Hallo ${profile?.full_name || ""},

du wurdest zum ${companyName} System eingeladen.
Bitte klicke auf den Link, um dein Passwort zu setzen:
${actionLink}

Wenn du keinen Zugriff erwartest, melde dich bitte bei deinem Disponenten.`;
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
              Einladung
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px;">
        <div style="background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">
          <div style="background:${brandPrimary}; color:#ffffff; padding:18px 24px;">
            <h1 style="margin:0; font-size:20px; font-weight:700;">Hallo ${profile?.full_name || ""}</h1>
            <p style="margin:6px 0 0; font-size:14px; opacity:0.9;">Willkommen bei ${companyName}.</p>
          </div>
          <div style="padding:20px 24px;">
            <p style="margin:0 0 12px; font-size:14px;">Du wurdest zum System eingeladen. Bitte setze jetzt dein Passwort:</p>
            <p style="margin:0 0 16px;">
              <a href="${actionLink}" style="display:inline-block; background:${brandPrimary}; color:#ffffff; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:600;">
                Passwort einrichten
              </a>
            </p>
            <p style="margin:0; font-size:12px; color:#64748b;">
              Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br/>
              <a href="${actionLink}" style="color:${brandSecondary};">${actionLink}</a>
            </p>
            <p style="margin:16px 0 0; font-size:12px; color:#94a3b8;">
              Wenn du keinen Zugriff erwartest, melde dich bitte bei deinem Disponenten.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: email,
        subject,
        text,
        html,
        replyTo,
        from: fromAddress,
        smtp: resolvedSmtp,
      });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({ ok: true, data: { email, actionLink, emailSent } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
