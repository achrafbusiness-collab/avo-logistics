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

const REMINDER_DAYS_BEFORE = 3;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }

  // Protect with a secret key so only cron/admin can call this
  const authHeader = req.headers["x-api-key"] || req.headers["authorization"];
  const expectedKey = process.env.CRON_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authHeader || (authHeader !== expectedKey && authHeader !== `Bearer ${expectedKey}`)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: "Supabase nicht konfiguriert" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Find trial companies expiring in exactly REMINDER_DAYS_BEFORE days
    const now = new Date();
    const reminderDate = new Date(now);
    reminderDate.setDate(reminderDate.getDate() + REMINDER_DAYS_BEFORE);
    const reminderDateStr = reminderDate.toISOString().split("T")[0];

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, name, trial_expires_at, owner_user_id, contact_email")
      .eq("account_type", "trial")
      .eq("is_active", true)
      .gte("trial_expires_at", `${reminderDateStr}T00:00:00`)
      .lt("trial_expires_at", `${reminderDateStr}T23:59:59`);

    if (companyError) {
      return res.status(500).json({ ok: false, error: companyError.message });
    }

    if (!companies || companies.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: "Keine Erinnerungen fällig" });
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(200).json({ ok: true, sent: 0, message: "SMTP nicht konfiguriert" });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sentCount = 0;

    for (const company of companies) {
      // Get owner email
      let email = company.contact_email;
      if (!email && company.owner_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", company.owner_user_id)
          .maybeSingle();
        if (profile) {
          email = profile.email;
        }
      }

      if (!email) continue;

      const expiryDate = new Date(company.trial_expires_at).toLocaleDateString("de-DE");

      try {
        await transporter.sendMail({
          from: `"TransferFleet" <${smtpFrom}>`,
          to: email,
          subject: `Ihre TransferFleet-Testphase endet in ${REMINDER_DAYS_BEFORE} Tagen`,
          html: `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
              <div style="background: linear-gradient(135deg, #1e3a5f, #2d5a8a); padding: 32px; border-radius: 12px 12px 0 0;">
                <h1 style="color: #ffffff; font-size: 22px; margin: 0;">Ihre Testphase endet bald</h1>
              </div>
              <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 15px; line-height: 1.7;">
                  Hallo,
                </p>
                <p style="color: #374151; font-size: 15px; line-height: 1.7;">
                  Ihre kostenlose Testphase von <strong>TransferFleet</strong> für
                  <strong>${company.name || "Ihr Unternehmen"}</strong> endet am
                  <strong>${expiryDate}</strong>.
                </p>
                <p style="color: #374151; font-size: 15px; line-height: 1.7;">
                  Damit Sie TransferFleet ohne Unterbrechung weiter nutzen können,
                  upgraden Sie jetzt auf die Vollversion.
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="https://app.transferfleet.de/Upgrade"
                     style="background: linear-gradient(135deg, #1e3a5f, #2d5a8a); color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
                    Jetzt upgraden →
                  </a>
                </div>
                <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
                  Nach Ablauf der Testphase bleibt Ihr Account erhalten —
                  Sie können sich nur nicht mehr anmelden, bis das Upgrade abgeschlossen ist.
                  Ihre Daten gehen nicht verloren.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                  TransferFleet — Disposition der Zukunft<br />
                  Bei Fragen: info@transferfleet.de
                </p>
              </div>
            </div>
          `,
        });
        sentCount++;
      } catch {
        // Skip failed sends, continue with others
      }
    }

    return res.status(200).json({ ok: true, sent: sentCount, total: companies.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Interner Fehler" });
  }
}
