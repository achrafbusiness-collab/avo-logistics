import { supabase } from "@/lib/supabaseClient";
import { getFinanceSettings } from "@/utils/invoiceStorage";

const listeners = new Set();

const emit = (event) => {
  listeners.forEach((listener) => {
    try { listener(event); } catch {}
  });
};

export const subscribeCustomerProtocolNotifications = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const fmtDate = (v) => {
  if (!v) return "–";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "–" : d.toLocaleDateString("de-DE");
};

const fmtDateTime = (v) => {
  if (!v) return "–";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "–" : `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
};

const buildProtocolHtml = (order, pickup, dropoff, settings) => {
  const companyName = settings?.invoiceProfile?.companyName || "TransferFleet";
  const companyAddress = [settings?.invoiceProfile?.street, `${settings?.invoiceProfile?.postalCode || ""} ${settings?.invoiceProfile?.city || ""}`.trim()].filter(Boolean).join(", ");
  const companyPhone = settings?.invoiceProfile?.phone || "";
  const companyEmail = settings?.invoiceProfile?.email || "";

  const pickupAddr = [order.pickup_address, `${order.pickup_postal_code || ""} ${order.pickup_city || ""}`.trim()].filter(Boolean).join(", ");
  const dropoffAddr = [order.dropoff_address, `${order.dropoff_postal_code || ""} ${order.dropoff_city || ""}`.trim()].filter(Boolean).join(", ");

  const damages = [...(pickup?.damages || []), ...(dropoff?.damages || [])];
  const damageRows = damages.length > 0
    ? damages.slice(0, 10).map((d) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${d.location || "–"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${d.type || "–"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${d.note || ""}</td></tr>`).join("")
    : `<tr><td colspan="3" style="padding:12px;color:#9ca3af;text-align:center;">Keine Schäden dokumentiert</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8a);padding:28px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:0.5px;">FAHRZEUGPROTOKOLL</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">${order.order_number || ""} • ${order.license_plate || ""}</p>
  </div>

  <!-- Body -->
  <div style="background:#ffffff;padding:0;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">

    <!-- Fahrzeug -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
      <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 14px;display:flex;align-items:center;">🚗 Fahrzeugdaten</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#6b7280;width:140px;">Kennzeichen</td><td style="padding:4px 0;font-weight:600;color:#1e293b;">${order.license_plate || "–"}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Marke / Modell</td><td style="padding:4px 0;color:#1e293b;">${order.vehicle_brand || "–"} ${order.vehicle_model || ""}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Farbe</td><td style="padding:4px 0;color:#1e293b;">${order.vehicle_color || "–"}</td></tr>
        ${order.vin ? `<tr><td style="padding:4px 0;color:#6b7280;">VIN</td><td style="padding:4px 0;color:#1e293b;font-size:12px;">${order.vin}</td></tr>` : ""}
      </table>
    </div>

    <!-- Route -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;width:48%;padding-right:12px;">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">
              <h3 style="color:#1e40af;font-size:13px;margin:0 0 10px;">📍 Abholung</h3>
              <p style="margin:0 0 4px;color:#1e293b;font-weight:600;font-size:13px;">${pickupAddr || "–"}</p>
              <p style="margin:0;color:#6b7280;font-size:12px;">${fmtDateTime(pickup?.datetime || order.pickup_date)}</p>
              ${pickup?.kilometer ? `<p style="margin:4px 0 0;color:#6b7280;font-size:12px;">KM: ${pickup.kilometer}</p>` : ""}
              ${pickup?.fuel_level ? `<p style="margin:2px 0 0;color:#6b7280;font-size:12px;">Tank: ${pickup.fuel_level}</p>` : ""}
            </div>
          </td>
          <td style="vertical-align:middle;text-align:center;width:4%;color:#94a3b8;font-size:20px;">→</td>
          <td style="vertical-align:top;width:48%;padding-left:12px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;">
              <h3 style="color:#166534;font-size:13px;margin:0 0 10px;">📍 Abgabe</h3>
              <p style="margin:0 0 4px;color:#1e293b;font-weight:600;font-size:13px;">${dropoffAddr || "–"}</p>
              <p style="margin:0;color:#6b7280;font-size:12px;">${fmtDateTime(dropoff?.datetime || order.dropoff_date)}</p>
              ${dropoff?.kilometer ? `<p style="margin:4px 0 0;color:#6b7280;font-size:12px;">KM: ${dropoff.kilometer}</p>` : ""}
              ${dropoff?.fuel_level ? `<p style="margin:2px 0 0;color:#6b7280;font-size:12px;">Tank: ${dropoff.fuel_level}</p>` : ""}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Schäden -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
      <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 14px;">⚠️ Schadensprotokoll</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0;">Bereich</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0;">Art</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0;">Notiz</th>
        </tr>
        ${damageRows}
      </table>
    </div>

    ${order.notes ? `
    <!-- Bemerkungen -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
      <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 10px;">📝 Bemerkungen</h2>
      <p style="color:#374151;font-size:13px;line-height:1.6;margin:0;background:#f8fafc;padding:12px;border-radius:8px;">${order.notes.replace(/\n/g, "<br>")}</p>
    </div>
    ` : ""}

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f8fafc;border-radius:0 0 12px 12px;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">Erstellt am ${fmtDate(new Date())} • ${companyName}</p>
      ${companyAddress ? `<p style="margin:2px 0 0;color:#94a3b8;font-size:11px;">${companyAddress}</p>` : ""}
      ${companyPhone || companyEmail ? `<p style="margin:2px 0 0;color:#94a3b8;font-size:11px;">${[companyPhone, companyEmail].filter(Boolean).join(" • ")}</p>` : ""}
    </div>
  </div>

  <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;">Diese E-Mail wurde automatisch von TransferFleet generiert.</p>
</div>
</body>
</html>`;
};

export const sendCustomerProtocolInBackground = ({
  orderId,
  protocolChecklistId,
  customerProtocolEmail,
}) => {
  const targetEmail = String(customerProtocolEmail || "").trim();
  if (!orderId) throw new Error("Auftrag fehlt.");
  if (!targetEmail) throw new Error("Bitte E-Mail-Adresse eingeben.");

  emit({ id: `cp-start-${Date.now()}`, type: "info", message: "Erstelle Protokoll..." });

  void (async () => {
    try {
      // 1. Token
      let token = null;
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
      }
      if (!token) throw new Error("Nicht angemeldet.");

      // 2. Daten laden
      emit({ id: `cp-data-${Date.now()}`, type: "info", message: "Lade Auftragsdaten..." });
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) throw new Error("Auftrag nicht gefunden.");

      const { data: checklists } = await supabase
        .from("checklists")
        .select("*")
        .eq("order_id", orderId);

      const pickup = (checklists || []).find((c) => c.type === "pickup");
      const dropoff = (checklists || []).find((c) => c.type === "dropoff");
      const settings = getFinanceSettings();

      // 3. HTML-E-Mail erstellen
      emit({ id: `cp-html-${Date.now()}`, type: "info", message: "Erstelle Protokoll..." });
      const htmlBody = buildProtocolHtml(order, pickup, dropoff, settings);

      // 4. Senden
      emit({ id: `cp-send-${Date.now()}`, type: "info", message: `Sende an ${targetEmail}...` });
      const emailResponse = await fetch("/api/admin/send-system-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll ${order.order_number || ""} – ${order.license_plate || ""}`,
          htmlBody,
          textBody: `Fahrzeugprotokoll ${order.order_number || ""}\nKennzeichen: ${order.license_plate || ""}\nRoute: ${order.pickup_city || ""} → ${order.dropoff_city || ""}`,
        }),
      });

      const emailPayload = await emailResponse.json();
      if (!emailResponse.ok || !emailPayload?.ok) {
        throw new Error(emailPayload?.error || "E-Mail-Versand fehlgeschlagen.");
      }

      emit({
        id: `cp-success-${Date.now()}`,
        type: "success",
        message: `Protokoll an ${targetEmail} gesendet.`,
      });
    } catch (error) {
      emit({
        id: `cp-error-${Date.now()}`,
        type: "error",
        message: error?.message || "Versand fehlgeschlagen.",
      });
    }
  })();
};
