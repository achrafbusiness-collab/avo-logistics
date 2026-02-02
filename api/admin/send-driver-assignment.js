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

const getProfileForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
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

const sendEmail = async ({ from, to, subject, html, text, replyTo, smtp, attachments }) => {
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
    attachments,
  });
  return true;
};

const formatAddress = (parts) =>
  parts
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" ");

const formatDateTime = (dateValue, timeValue) =>
  [dateValue, timeValue].filter(Boolean).join(" ").trim();

const pickLatestChecklist = (checklists, type) => {
  const list = (checklists || []).filter((item) => item?.type === type);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const aTime = new Date(a.datetime || a.created_date || a.created_at || 0).getTime();
    const bTime = new Date(b.datetime || b.created_date || b.created_at || 0).getTime();
    return bTime - aTime;
  })[0];
};

const resolvePublicSiteUrl = (req) => {
  const fromEnv =
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) {
    return String(fromEnv).replace(/\/+$/, "");
  }
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const forwardedHost =
    req?.headers?.["x-forwarded-host"] || req?.headers?.host || "avo-logistics.app";
  return `${forwardedProto}://${String(forwardedHost).replace(/\/+$/, "")}`;
};

const generateProtocolPdfFromPage = async ({ siteUrl, checklistId, authToken }) => {
  const [{ default: puppeteer }, chromiumModule] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ]);
  const chromium = chromiumModule.default || chromiumModule;
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2200, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const requestUrl = request.url();
      const isSupabaseRest = supabaseUrl && requestUrl.startsWith(`${supabaseUrl}/rest/v1/`);
      const isSupabaseStorage = supabaseUrl && requestUrl.startsWith(`${supabaseUrl}/storage/v1/`);
      if ((isSupabaseRest || isSupabaseStorage) && authToken) {
        const headers = {
          ...request.headers(),
          authorization: `Bearer ${authToken}`,
        };
        request.continue({ headers });
        return;
      }
      request.continue();
    });
    const url = `${siteUrl.replace(/\/+$/, "")}/protocol-pdf?checklistId=${encodeURIComponent(
      checklistId
    )}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    try {
      await page.waitForFunction(
        () => {
          const hasPdf = !!document.querySelector(".pdf-page");
          const text = String(document.body?.innerText || "");
          return hasPdf && !text.includes("Protokoll wird geladen");
        },
        { timeout: 120000 }
      );
      await page.waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll(".pdf-page img"));
          if (!images.length) return true;
          return images.every((img) => img.complete && img.naturalWidth > 0);
        },
        { timeout: 180000 }
      );
      await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll(".pdf-page img"));
        await Promise.all(
          images.map((img) => {
            if (typeof img.decode === "function") {
              return img.decode().catch(() => null);
            }
            return Promise.resolve();
          })
        );
      });
    } catch (error) {
      const previewText = await page.evaluate(() =>
        String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 240)
      );
      throw new Error(`Render timeout. Seite: ${previewText || "leer"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
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

    const profile = await getProfileForUser(authData.user.id);
    if (!profile?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }
    if (profile.role === "driver") {
      res.status(403).json({ ok: false, error: "Keine Berechtigung." });
      return;
    }

    const body = await readJsonBody(req);
    const {
      orderId,
      testEmail,
      to,
      welcomeEmail,
      sendCustomerProtocol,
      customerProtocolEmail,
      protocolChecklistId,
    } = body || {};

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select(
        "email_sender_name, email_sender_address, support_email, company_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure"
      )
      .eq("company_id", profile.company_id)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const senderName = settings?.email_sender_name || settings?.company_name || "";
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

    if (testEmail) {
      const target = to || resolvedSmtp.user || senderAddress;
      if (!target) {
        res.status(400).json({ ok: false, error: "Bitte Test-E-Mail-Adresse angeben." });
        return;
      }
      if (!canSendEmail(resolvedSmtp)) {
        res.status(400).json({ ok: false, error: "SMTP ist nicht konfiguriert." });
        return;
      }
      const subject = "AVO Test-E-Mail";
      const text = `Hallo,

dies ist eine Test-E-Mail aus deinem AVO System.

Absender: ${fromAddress}
Unternehmen: ${settings?.company_name || "-"}

Wenn du diese E-Mail erhalten hast, ist SMTP korrekt eingerichtet.`;
      const html = `<p>Hallo,</p>
<p>dies ist eine Test-E-Mail aus deinem AVO System.</p>
<ul>
  <li><strong>Absender:</strong> ${fromAddress}</li>
  <li><strong>Unternehmen:</strong> ${settings?.company_name || "-"}</li>
</ul>
<p>Wenn du diese E-Mail erhalten hast, ist SMTP korrekt eingerichtet.</p>`;
      try {
        const emailSent = await sendEmail({
          to: target,
          subject,
          text,
          html,
          from: fromAddress,
          replyTo,
          smtp: resolvedSmtp,
        });
        if (!emailSent) {
          res.status(400).json({ ok: false, error: "Test-E-Mail konnte nicht gesendet werden." });
          return;
        }
        res.status(200).json({ ok: true, data: { emailSent: true } });
        return;
      } catch (err) {
        res.status(400).json({ ok: false, error: err?.message || "Test-E-Mail fehlgeschlagen." });
        return;
      }
    }

    if (welcomeEmail) {
      const target = to || authData.user.email || resolvedSmtp.user || senderAddress;
      if (!target) {
        res.status(400).json({ ok: false, error: "Bitte E-Mail-Adresse angeben." });
        return;
      }
      if (!canSendEmail(resolvedSmtp)) {
        res.status(400).json({ ok: false, error: "SMTP ist nicht konfiguriert." });
        return;
      }
      const companyName = settings?.company_name || "AVO Logistics";
      const subject = `Herzlich willkommen bei ${companyName}`;
      const text = `Hallo,

herzlich willkommen bei ${companyName}! Dein Konto ist jetzt aktiv.

Du kannst ab sofort:
- Aufträge anlegen und verwalten
- Fahrer und Kunden einsehen
- AI Import und AVO AI nutzen
- Team und Einstellungen verwalten

Admin Controlling ist nur für System-Admins sichtbar.

Bei Fragen wende dich bitte an deinen Disponenten.

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
              Willkommen
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
            <p style="margin:6px 0 0; font-size:14px; opacity:0.9;">Dein Konto ist jetzt aktiv.</p>
          </div>
          <div style="padding:20px 24px;">
            <p style="margin:0 0 12px; font-size:14px;">
              Schön, dass du dabei bist. Ab sofort kannst du im System:
            </p>
            <ul style="padding-left:18px; margin:0 0 16px; font-size:14px; color:#0f172a;">
              <li>Aufträge anlegen und verwalten</li>
              <li>Fahrer und Kunden einsehen</li>
              <li>AI Import und AVO AI nutzen</li>
              <li>Team und Einstellungen verwalten</li>
            </ul>
            <p style="margin:0 0 12px; font-size:13px; color:#64748b;">
              Admin Controlling ist nur für System-Admins sichtbar.
            </p>
            <p style="margin:0; font-size:13px; color:#64748b;">
              Bei Fragen wende dich bitte an deinen Disponenten.
            </p>
            <p style="margin:16px 0 0; font-size:14px;">Viele Grüße<br/>${companyName}</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>`;
      try {
        const emailSent = await sendEmail({
          to: target,
          subject,
          text,
          html,
          from: fromAddress,
          replyTo,
          smtp: resolvedSmtp,
        });
        if (!emailSent) {
          res.status(400).json({ ok: false, error: "Willkommens-E-Mail konnte nicht gesendet werden." });
          return;
        }
        res.status(200).json({ ok: true, data: { emailSent: true } });
        return;
      } catch (err) {
        res.status(400).json({ ok: false, error: err?.message || "Willkommens-E-Mail fehlgeschlagen." });
        return;
      }
    }

    if (!orderId) {
      res.status(400).json({ ok: false, error: "Missing orderId" });
      return;
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_order_number, customer_id, customer_name, customer_email, license_plate, vehicle_brand, vehicle_model, pickup_address, pickup_postal_code, pickup_city, pickup_date, pickup_time, dropoff_address, dropoff_postal_code, dropoff_city, dropoff_date, dropoff_time, assigned_driver_id, assigned_driver_name, company_id"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      res.status(500).json({ ok: false, error: orderError.message });
      return;
    }

    if (!order || order.company_id !== profile.company_id) {
      res.status(404).json({ ok: false, error: "Auftrag nicht gefunden." });
      return;
    }

    if (sendCustomerProtocol) {
      if (!canSendEmail(resolvedSmtp)) {
        res.status(400).json({ ok: false, error: "SMTP ist nicht konfiguriert." });
        return;
      }

      let recipientEmail = String(customerProtocolEmail || order.customer_email || "").trim();
      if (!recipientEmail && order.customer_id) {
        const { data: customer } = await supabaseAdmin
          .from("customers")
          .select("email")
          .eq("id", order.customer_id)
          .eq("company_id", profile.company_id)
          .maybeSingle();
        if (customer?.email) {
          recipientEmail = String(customer.email).trim();
        }
      }

      if (!recipientEmail) {
        res.status(400).json({ ok: false, error: "Keine Kunden-E-Mail gefunden." });
        return;
      }

      const { data: orderChecklists, error: checklistError } = await supabaseAdmin
        .from("checklists")
        .select(
          "id, type, datetime, location, kilometer, fuel_level, cleanliness_inside, cleanliness_outside, lighting, accessories, damages, expenses, mandatory_checks, signature_driver, signature_customer, signature_refused, created_date"
        )
        .eq("order_id", order.id)
        .eq("company_id", profile.company_id)
        .order("created_date", { ascending: false })
        .limit(200);

      if (checklistError) {
        res.status(500).json({ ok: false, error: checklistError.message });
        return;
      }

      const protocolChecklist = protocolChecklistId
        ? (orderChecklists || []).find((item) => item.id === protocolChecklistId) || null
        : null;
      const pickupChecklist = pickLatestChecklist(orderChecklists, "pickup");
      const dropoffChecklist = pickLatestChecklist(orderChecklists, "dropoff");
      const selectedChecklistId =
        protocolChecklist?.id || dropoffChecklist?.id || pickupChecklist?.id || null;
      if (!selectedChecklistId) {
        res.status(400).json({ ok: false, error: "Kein Protokoll fuer den Auftrag vorhanden." });
        return;
      }
      const companyName = settings?.company_name || "AVO Logistics";
      const vehicleLabel = [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") || "-";
      const pickupLine = formatAddress([
        order.pickup_address,
        order.pickup_postal_code,
        order.pickup_city,
      ]);
      const dropoffLine = formatAddress([
        order.dropoff_address,
        order.dropoff_postal_code,
        order.dropoff_city,
      ]);
      const subject = `Protokoll Auftrag ${order.order_number || "-"}`;
      const text = `Sehr geehrte Damen und Herren,

anbei erhalten Sie das Protokoll fuer das Fahrzeug ${vehicleLabel} (${order.license_plate || "-"}) zum Auftrag ${order.order_number || "-"}.

Strecke:
Von: ${pickupLine || "-"}
Nach: ${dropoffLine || "-"}

Das Protokoll finden Sie im Anhang dieser E-Mail.

Mit freundlichen Gruessen
${companyName}`;
      const html = `
<div style="background:#f4f6fb; padding:24px 0; font-family:Arial, sans-serif; color:#0f172a;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px; margin:0 auto;">
    <tr>
      <td style="padding:0 20px;">
        <div style="background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">
          <div style="background:${brandPrimary}; color:#ffffff; padding:18px 24px;">
            <h1 style="margin:0; font-size:20px; font-weight:700;">Protokoll zum Auftrag ${order.order_number || "-"}</h1>
          </div>
          <div style="padding:20px 24px; font-size:14px; line-height:1.5;">
            <p style="margin:0 0 12px;">Sehr geehrte Damen und Herren,</p>
            <p style="margin:0 0 12px;">
              anbei erhalten Sie das Protokoll fuer das Fahrzeug <strong>${vehicleLabel}</strong>
              (${order.license_plate || "-"}) zum Auftrag <strong>${order.order_number || "-"}</strong>.
            </p>
            <p style="margin:0 0 6px;"><strong>Strecke:</strong></p>
            <p style="margin:0;">Von: ${pickupLine || "-"}</p>
            <p style="margin:0 0 12px;">Nach: ${dropoffLine || "-"}</p>
            <p style="margin:0 0 12px;">Das Protokoll finden Sie im Anhang dieser E-Mail.</p>
            <p style="margin:0;">Mit freundlichen Gruessen<br/>${companyName}</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</div>`;
      let attachment;
      try {
        const siteUrl = resolvePublicSiteUrl(req);
        attachment = await generateProtocolPdfFromPage({
          siteUrl,
          checklistId: selectedChecklistId,
          authToken: token,
        });
      } catch (error) {
        const reason = String(error?.message || "unbekannt");
        res.status(500).json({
          ok: false,
          error: `Protokoll-PDF konnte nicht erzeugt werden: ${reason}`,
        });
        return;
      }
      const safeOrderFileId = String(order.order_number || order.id).replace(/[^a-z0-9._-]/gi, "_");

      const emailSent = await sendEmail({
        to: recipientEmail,
        subject,
        text,
        html,
        from: fromAddress,
        replyTo,
        smtp: resolvedSmtp,
        attachments: [
          {
            filename: `protokoll-${safeOrderFileId}.pdf`,
            content: attachment,
            contentType: "application/pdf",
          },
        ],
      });

      if (!emailSent) {
        res.status(400).json({ ok: false, error: "E-Mail konnte nicht gesendet werden." });
        return;
      }

      res.status(200).json({
        ok: true,
        data: { emailSent: true, to: recipientEmail },
      });
      return;
    }

    const pickupLine = formatAddress([
      order.pickup_address,
      order.pickup_postal_code,
      order.pickup_city,
    ]);
    const dropoffLine = formatAddress([
      order.dropoff_address,
      order.dropoff_postal_code,
      order.dropoff_city,
    ]);
    const pickupWhen = formatDateTime(order.pickup_date, order.pickup_time);
    const dropoffWhen = formatDateTime(order.dropoff_date, order.dropoff_time);

    if (!order.assigned_driver_id) {
      res.status(400).json({ ok: false, error: "Kein Fahrer zugewiesen." });
      return;
    }

    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, email, first_name, last_name")
      .eq("id", order.assigned_driver_id)
      .maybeSingle();

    if (driverError) {
      res.status(500).json({ ok: false, error: driverError.message });
      return;
    }

    if (!driver?.email) {
      res.status(400).json({ ok: false, error: "Fahrer-E-Mail fehlt." });
      return;
    }

    const signatureName = senderName || settings?.company_name || "AVO Logistics";
    const subject = `Auftragsbestätigung – Auftrag ${order.order_number || ""} zugewiesen`;
    const text = `Hallo ${order.assigned_driver_name || "Fahrer"},

du hast einen neuen Auftrag erhalten.

Auftrag: ${order.order_number || "-"}
Kundenauftrag: ${order.customer_order_number || "-"}
Kunde: ${order.customer_name || "-"}
Fahrzeug: ${[order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") || "-"}
Kennzeichen: ${order.license_plate || "-"}

Abholung: ${pickupLine || "-"}
Abholzeit: ${pickupWhen || "-"}

Abgabe: ${dropoffLine || "-"}
Abgabezeit: ${dropoffWhen || "-"}

Weitere Details findest du in der Fahrer‑App.

Viele Grüße
${signatureName}

hinweis: diese e-mail kann nicht beantwortet werden. antworten werden nicht gelesen.
bei fragen bitte deinen disponenten kontaktieren.`;

    const html = `
<div style="background:#f4f6fb; padding:24px 0; font-family:Arial, sans-serif; color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px; margin:0 auto;">
    <tr>
      <td style="padding:0 20px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="text-align:left;">
              <img src="${logoUrl}" alt="AVO Logistics" style="height:48px; display:block; border-radius:8px;" />
            </td>
            <td style="text-align:right; font-size:12px; color:${brandSecondary}; font-weight:600;">
              Auftragsbestätigung
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px;">
        <div style="background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">
          <div style="background:${brandPrimary}; color:#ffffff; padding:18px 24px;">
            <h1 style="margin:0; font-size:20px; font-weight:700;">Hallo ${order.assigned_driver_name || "Fahrer"}</h1>
            <p style="margin:6px 0 0; font-size:14px; opacity:0.9;">Du hast einen neuen Auftrag erhalten.</p>
          </div>
          <div style="padding:20px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">
              <tr>
                <td style="padding:6px 0; color:#64748b; width:140px;">Auftrag</td>
                <td style="padding:6px 0; font-weight:600; color:${brandPrimary};">${order.order_number || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Kundenauftrag</td>
                <td style="padding:6px 0;">${order.customer_order_number || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Kunde</td>
                <td style="padding:6px 0;">${order.customer_name || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Fahrzeug</td>
                <td style="padding:6px 0;">${[order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Kennzeichen</td>
                <td style="padding:6px 0;">${order.license_plate || "-"}</td>
              </tr>
            </table>
            <div style="height:1px; background:#e2e8f0; margin:18px 0;"></div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">
              <tr>
                <td style="padding:6px 0; color:#64748b; width:140px;">Abholung</td>
                <td style="padding:6px 0;">${pickupLine || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Abholzeit</td>
                <td style="padding:6px 0;">${pickupWhen || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Abgabe</td>
                <td style="padding:6px 0;">${dropoffLine || "-"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; color:#64748b;">Abgabezeit</td>
                <td style="padding:6px 0;">${dropoffWhen || "-"}</td>
              </tr>
            </table>
            <p style="margin:18px 0 0; font-size:14px;">Weitere Details findest du in der Fahrer‑App.</p>
            <p style="margin:18px 0 0; font-size:14px;">Viele Grüße<br/>${signatureName}</p>
            <p style="margin:18px 0 0; font-size:11px; color:#94a3b8; text-transform:lowercase;">
              hinweis: diese e-mail kann nicht beantwortet werden. antworten werden nicht gelesen.<br/>
              bei fragen bitte deinen disponenten kontaktieren.
            </p>
          </div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 20px; text-align:center; font-size:11px; color:#94a3b8;">
        AVO Logistics • Automatische Systembenachrichtigung
      </td>
    </tr>
  </table>
</div>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: driver.email,
        subject,
        text,
        html,
        from: fromAddress,
        replyTo,
        smtp: resolvedSmtp,
      });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({ ok: true, data: { emailSent } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
