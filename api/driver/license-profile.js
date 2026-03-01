import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tokenSecret = process.env.LICENSE_TOKEN_SECRET;

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const toBase64Url = (base64String) =>
  String(base64String || "").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const base64UrlDecode = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf-8");
};

const verifySignedToken = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    throw new Error("Ungültiger Token.");
  }
  const [payloadEncoded, signatureEncoded] = parts;
  const expectedSignature = toBase64Url(
    crypto.createHmac("sha256", tokenSecret).update(payloadEncoded).digest("base64")
  );
  const incomingBuffer = Buffer.from(signatureEncoded);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    incomingBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(incomingBuffer, expectedBuffer)
  ) {
    throw new Error("Token-Signatur ungültig.");
  }
  const payloadRaw = base64UrlDecode(payloadEncoded);
  const payload = JSON.parse(payloadRaw);
  if (!payload?.uid || !payload?.company_id || !payload?.day) {
    throw new Error("Token-Inhalt unvollständig.");
  }
  return payload;
};

const isTokenValidForToday = (day) => {
  const today = new Date().toISOString().slice(0, 10);
  return String(day || "") === today;
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey || !tokenSecret) {
    res.status(500).json({ ok: false, error: "Missing server config" });
    return;
  }

  try {
    const token = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
    if (!token) {
      res.status(400).json({ ok: false, error: "Token fehlt." });
      return;
    }

    const payload = verifySignedToken(token);
    if (!isTokenValidForToday(payload.day)) {
      res.status(401).json({ ok: false, error: "Token ist nicht mehr gültig." });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, company_id")
      .eq("id", payload.uid)
      .maybeSingle();

    if (profileError || !profile || profile.company_id !== payload.company_id) {
      res.status(404).json({ ok: false, error: "Profil nicht gefunden." });
      return;
    }

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select(
        "id, first_name, last_name, email, phone, city, country, address, license_front, license_back"
      )
      .eq("company_id", payload.company_id)
      .ilike("email", profile.email || "")
      .maybeSingle();

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("company_name, support_phone, support_email, legal_text, delivery_legal_text")
      .eq("company_id", payload.company_id)
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let activeOrders = [];
    if (driver?.id) {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, license_plate, pickup_city, dropoff_city, status")
        .eq("company_id", payload.company_id)
        .eq("assigned_driver_id", driver.id)
        .order("created_date", { ascending: false })
        .limit(20);

      activeOrders = (orders || []).filter(
        (item) => !["completed", "cancelled"].includes(String(item?.status || "").toLowerCase())
      );
    }

    const { data: driverDocuments } = await supabaseAdmin
      .from("driver_documents")
      .select("id, title, category, file_url, driver_user_id, created_date")
      .eq("company_id", payload.company_id)
      .order("created_date", { ascending: false })
      .limit(100);

    const matchingDocs = (driverDocuments || []).filter((doc) => {
      if (!doc?.file_url) return false;
      if (doc.driver_user_id && doc.driver_user_id !== payload.uid) return false;
      const text = `${doc.title || ""} ${doc.category || ""}`.toLowerCase();
      return (
        text.includes("vollmacht") ||
        text.includes("bevoll") ||
        text.includes("authorization") ||
        text.includes("berechtigung")
      );
    });
    const powerOfAttorney = matchingDocs[0] || null;

    const driverName =
      [driver?.first_name, driver?.last_name].filter(Boolean).join(" ").trim() ||
      profile.full_name ||
      profile.email;

    res.status(200).json({
      ok: true,
      data: {
        validOn: payload.day,
        verifiedAt: new Date().toISOString(),
        company: {
          id: payload.company_id,
          name: settings?.company_name || "AVO Logistics",
          supportPhone: settings?.support_phone || "",
          supportEmail: settings?.support_email || "",
        },
        driver: {
          id: payload.uid,
          name: driverName,
          email: profile.email || driver?.email || "",
          phone: driver?.phone || "",
          city: driver?.city || "",
          country: driver?.country || "",
          address: driver?.address || "",
        },
        authorization: {
          text:
            settings?.delivery_legal_text ||
            settings?.legal_text ||
            `${driverName} ist heute berechtigt, Fahrzeuge im Auftrag von ${
              settings?.company_name || "AVO Logistics"
            } zu überführen.`,
          powerOfAttorney: powerOfAttorney
            ? {
                title: powerOfAttorney.title || "Vollmacht",
                fileUrl: powerOfAttorney.file_url,
              }
            : null,
        },
        documents: {
          driverLicenseFront: driver?.license_front || null,
          driverLicenseBack: driver?.license_back || null,
        },
        activeOrders: (activeOrders || []).map((item) => ({
          id: item.id,
          orderNumber: item.order_number || "-",
          plate: item.license_plate || "-",
          route: `${item.pickup_city || "-"} -> ${item.dropoff_city || "-"}`,
          status: item.status || "-",
        })),
      },
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || "Token konnte nicht geprüft werden." });
  }
}
