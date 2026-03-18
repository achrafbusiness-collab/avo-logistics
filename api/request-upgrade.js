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

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "info@transferfleet.de";

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const { user_id, email, company_id, full_name, type, message } = body;

    if (!email) {
      return res.status(400).json({ ok: false, error: "E-Mail fehlt" });
    }

    // Get company info
    let companyName = "";
    let trialExpiresAt = "";
    let companyAddress = "";
    let companyPhone = "";
    let companyEmail = "";
    let driverLimit = 0;
    if (company_id && supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: company } = await supabase
        .from("companies")
        .select("name, trial_expires_at, address, phone, email, driver_limit")
        .eq("id", company_id)
        .maybeSingle();
      if (company) {
        companyName = company.name || "";
        trialExpiresAt = company.trial_expires_at || "";
        companyAddress = company.address || "";
        companyPhone = company.phone || "";
        companyEmail = company.email || "";
        driverLimit = company.driver_limit || 0;
      }
    }

    // Determine email subject and type label
    const isSlotReduction = type === "slot_reduction";
    const subjectLine = isSlotReduction
      ? `Slot-Reduzierung: ${companyName || email}`
      : `Upgrade-Anfrage: ${companyName || email}`;
    const headingText = isSlotReduction ? "Slot-Reduzierung Anfrage" : "Neue Upgrade-Anfrage";

    // Send notification email to admin
    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const expiryFormatted = trialExpiresAt
        ? new Date(trialExpiresAt).toLocaleDateString("de-DE")
        : "unbekannt";

      await transporter.sendMail({
        from: `"TransferFleet System" <${smtpFrom}>`,
        to: ADMIN_EMAIL,
        subject: subjectLine,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px;">
            <h2 style="color: #1e3a5f;">${headingText}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666; width: 140px;">Ansprechpartner</td><td style="padding: 8px 0; font-weight: bold;">${full_name || "-"}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">E-Mail</td><td style="padding: 8px 0; font-weight: bold;">${email}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Unternehmen</td><td style="padding: 8px 0; font-weight: bold;">${companyName || "-"}</td></tr>
              ${companyAddress ? `<tr><td style="padding: 8px 0; color: #666;">Adresse</td><td style="padding: 8px 0;">${companyAddress}</td></tr>` : ""}
              ${companyPhone ? `<tr><td style="padding: 8px 0; color: #666;">Telefon</td><td style="padding: 8px 0;">${companyPhone}</td></tr>` : ""}
              ${companyEmail ? `<tr><td style="padding: 8px 0; color: #666;">Firmen-E-Mail</td><td style="padding: 8px 0;">${companyEmail}</td></tr>` : ""}
              <tr><td style="padding: 8px 0; color: #666;">Fahrer-Slots</td><td style="padding: 8px 0;">${driverLimit || "-"}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Trial endet</td><td style="padding: 8px 0; font-weight: bold;">${expiryFormatted}</td></tr>
              ${message ? `<tr><td style="padding: 8px 0; color: #666; vertical-align: top;">Nachricht</td><td style="padding: 8px 0;">${message}</td></tr>` : ""}
            </table>
            <p style="margin-top: 20px; color: #999; font-size: 12px;">Gesendet von TransferFleet System</p>
          </div>
        `,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Interner Fehler" });
  }
}
