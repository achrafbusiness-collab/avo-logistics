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

    const subject = "Dein AVO System Zugang";
    const text = `Hallo,

du wurdest zu AVO System eingeladen.
Bitte klicke auf den Link, um dein Passwort zu setzen:
${actionLink}
`;
    const html = `<p>Hallo,</p>
<p>du wurdest zu AVO System eingeladen.</p>
<p><strong>Passwort setzen:</strong><br/>
<a href="${actionLink}">${actionLink}</a></p>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({ to: email, subject, text, html });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({ ok: true, data: { email, actionLink, emailSent } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
