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

const canSendEmail = () =>
  Boolean(smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom);

const buildFromAddress = ({ name, address }) => {
  if (!address) return smtpFrom;
  if (!name) return address;
  const safeName = String(name).replace(/"/g, "");
  return `"${safeName}" <${address}>`;
};

const sendEmail = async ({ from, to, subject, html, text, replyTo }) => {
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
    from: from || smtpFrom,
    to,
    subject,
    text,
    html,
    replyTo,
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

    const { orderId } = await readJsonBody(req);
    if (!orderId) {
      res.status(400).json({ ok: false, error: "Missing orderId" });
      return;
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_order_number, customer_name, license_plate, vehicle_brand, vehicle_model, pickup_address, pickup_postal_code, pickup_city, pickup_date, pickup_time, dropoff_address, dropoff_postal_code, dropoff_city, dropoff_date, dropoff_time, assigned_driver_id, assigned_driver_name, company_id"
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

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("email_sender_name, email_sender_address, support_email, company_name")
      .eq("company_id", profile.company_id)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const senderName = settings?.email_sender_name || settings?.company_name || "";
    const senderAddress = settings?.email_sender_address || "";
    const fromAddress = buildFromAddress({ name: senderName, address: senderAddress });
    const replyTo = settings?.support_email || undefined;

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

    const subject = `Neuer Auftrag ${order.order_number || ""} zugewiesen`;
    const text = `Hallo ${order.assigned_driver_name || "Fahrer"},

dir wurde ein Auftrag zugewiesen.

Auftrag: ${order.order_number || "-"}
Kundenauftrag: ${order.customer_order_number || "-"}
Kunde: ${order.customer_name || "-"}
Fahrzeug: ${[order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") || "-"}
Kennzeichen: ${order.license_plate || "-"}

Abholung: ${pickupLine || "-"}
Abholzeit: ${pickupWhen || "-"}

Abgabe: ${dropoffLine || "-"}
Abgabezeit: ${dropoffWhen || "-"}

Weitere Details findest du in der Fahrer-App.`;

    const html = `<p>Hallo ${order.assigned_driver_name || "Fahrer"},</p>
<p>dir wurde ein Auftrag zugewiesen.</p>
<ul>
  <li><strong>Auftrag:</strong> ${order.order_number || "-"}</li>
  <li><strong>Kundenauftrag:</strong> ${order.customer_order_number || "-"}</li>
  <li><strong>Kunde:</strong> ${order.customer_name || "-"}</li>
  <li><strong>Fahrzeug:</strong> ${[order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") || "-"}</li>
  <li><strong>Kennzeichen:</strong> ${order.license_plate || "-"}</li>
</ul>
<p><strong>Abholung:</strong> ${pickupLine || "-"}<br/>
<strong>Abholzeit:</strong> ${pickupWhen || "-"}</p>
<p><strong>Abgabe:</strong> ${dropoffLine || "-"}<br/>
<strong>Abgabezeit:</strong> ${dropoffWhen || "-"}</p>
<p>Weitere Details findest du in der Fahrer-App.</p>`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: driver.email,
        subject,
        text,
        html,
        from: fromAddress,
        replyTo,
      });
    } catch (err) {
      emailSent = false;
    }

    res.status(200).json({ ok: true, data: { emailSent } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
