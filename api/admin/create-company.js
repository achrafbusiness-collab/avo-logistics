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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      res.status(500).json({ ok: false, error: profileError.message });
      return;
    }

    if (!profile?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const { data: ownerCompany, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("owner_user_id")
      .eq("id", profile.company_id)
      .maybeSingle();
    if (companyError) {
      res.status(500).json({ ok: false, error: companyError.message });
      return;
    }

    if (ownerCompany?.owner_user_id !== authData.user.id) {
      res.status(403).json({ ok: false, error: "Nicht erlaubt." });
      return;
    }

    const body = await readJsonBody(req);
    const { company_name, owner_full_name, owner_email, owner_phone, redirectTo } = body || {};
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
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: owner_email,
      options: {
        redirectTo,
        data: {
          full_name: owner_full_name,
          company_id: companyId,
          role: "admin",
        },
      },
    });

    if (linkError || !linkData?.user) {
      res.status(400).json({ ok: false, error: linkError?.message || "Invite link failed" });
      return;
    }

    const ownerUser = linkData.user;
    const actionLink = linkData.properties?.action_link || "";

    const { data: company, error: insertError } = await supabaseAdmin
      .from("companies")
      .insert({
        id: companyId,
        name: company_name,
        owner_user_id: ownerUser.id,
      })
      .select("*")
      .single();

    if (insertError) {
      res.status(500).json({ ok: false, error: insertError.message });
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
      company_id: companyId,
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from("app_settings").insert({
      company_id: companyId,
      company_name,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });

    const subject = "Dein AVO System Zugang";
    const text = `Hallo ${owner_full_name},

du hast einen neuen AVO System Mandanten erhalten: ${company_name}

Bitte klicke auf den Link, um dein Passwort zu setzen:
${actionLink}
`;
    const html = `<p>Hallo ${owner_full_name},</p>
<p>du hast einen neuen AVO System Mandanten erhalten: <strong>${company_name}</strong></p>
<p><strong>Passwort setzen:</strong><br/>
<a href="${actionLink}">${actionLink}</a></p>`;

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
        actionLink,
        emailSent,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
