import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL;
const systemAdminUserId = process.env.SYSTEM_ADMIN_USER_ID;

// Fallback SMTP from env
const envSmtp = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  secure: process.env.SMTP_SECURE !== "false",
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
};

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    // Auth check
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ ok: false, error: "Nicht angemeldet" });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user) return res.status(401).json({ ok: false, error: "Ungültiger Token" });

    // Get user profile to find their company
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile || profile.role === "driver") {
      return res.status(403).json({ ok: false, error: "Nicht erlaubt" });
    }

    const body = await readJsonBody(req);
    const { recipientEmail, subject, htmlBody, textBody, pdfBase64, pdfFilename } = body;

    if (!recipientEmail || !subject) {
      return res.status(400).json({ ok: false, error: "recipientEmail und subject sind Pflicht" });
    }

    // Load SMTP from user's company app_settings
    const companyId = profile.company_id;
    const { data: firstCompanyData } = companyId
      ? { data: { id: companyId } }
      : await supabase
          .from("companies")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

    let smtp = { ...envSmtp };
    let senderName = "TransferFleet";
    let senderAddress = envSmtp.from || "noreply@transferfleet.de";

    if (firstCompanyData?.id) {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, email_sender_name, email_sender_address, company_id")
        .eq("company_id", firstCompanyData.id)
        .maybeSingle();

      if (settings?.smtp_host && settings?.smtp_user && settings?.smtp_pass) {
        smtp = {
          host: settings.smtp_host,
          port: settings.smtp_port || 465,
          user: settings.smtp_user,
          pass: settings.smtp_pass,
          secure: settings.smtp_secure ?? true,
        };
        senderName = settings.email_sender_name || senderName;
        senderAddress = settings.email_sender_address || settings.smtp_user || senderAddress;
      }
    }

    if (!smtp.host || !smtp.user || !smtp.pass) {
      return res.status(500).json({ ok: false, error: "SMTP nicht konfiguriert" });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const mailOptions = {
      from: `"${senderName}" <${senderAddress}>`,
      to: recipientEmail,
      subject,
      text: textBody || "",
      html: htmlBody || "",
    };

    if (pdfBase64 && pdfFilename) {
      mailOptions.attachments = [
        {
          filename: pdfFilename,
          content: Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ];
    }

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "E-Mail konnte nicht gesendet werden" });
  }
}
