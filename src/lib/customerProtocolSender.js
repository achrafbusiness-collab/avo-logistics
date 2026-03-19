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
  const companyInfo = [
    settings?.invoiceProfile?.street,
    `${settings?.invoiceProfile?.postalCode || ""} ${settings?.invoiceProfile?.city || ""}`.trim(),
    settings?.invoiceProfile?.phone,
    settings?.invoiceProfile?.email,
  ].filter(Boolean).join(" | ");

  const pickupAddr = [order.pickup_address, `${order.pickup_postal_code || ""} ${order.pickup_city || ""}`.trim()].filter(Boolean).join(", ");
  const dropoffAddr = [order.dropoff_address, `${order.dropoff_postal_code || ""} ${order.dropoff_city || ""}`.trim()].filter(Boolean).join(", ");

  const damages = [...(pickup?.damages || []), ...(dropoff?.damages || [])];
  const damageRows = damages.length > 0
    ? damages.slice(0, 10).map((d) =>
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${d.location || "–"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${d.type || "–"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${d.note || ""}</td></tr>`
    ).join("")
    : `<tr><td colspan="3" style="padding:12px;color:#9ca3af;text-align:center;">Keine Schaeden dokumentiert</td></tr>`;

  const row = (label, value) =>
    `<tr><td style="padding:4px 0;color:#6b7280;width:130px;font-size:13px;">${label}</td><td style="padding:4px 0;color:#1e293b;font-size:13px;font-weight:500;">${value || "–"}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8a);padding:24px 28px;border-radius:12px 12px 0 0;">
<h1 style="color:#fff;margin:0;font-size:20px;">FAHRZEUGPROTOKOLL</h1>
<p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">${order.order_number || ""} | ${order.license_plate || ""}</p>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-top:0;padding:0;">

<div style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
<h2 style="color:#1e3a5f;font-size:14px;margin:0 0 12px;">Fahrzeugdaten</h2>
<table style="width:100%;border-collapse:collapse;">
${row("Kennzeichen", order.license_plate)}
${row("Marke / Modell", `${order.vehicle_brand || ""} ${order.vehicle_model || ""}`.trim())}
${row("Farbe", order.vehicle_color)}
${order.vin ? row("VIN", order.vin) : ""}
</table>
</div>

<div style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
<table style="width:100%;border-collapse:collapse;"><tr>
<td style="vertical-align:top;width:48%;padding-right:8px;">
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;">
<h3 style="color:#1e40af;font-size:12px;margin:0 0 8px;">ABHOLUNG</h3>
<p style="margin:0 0 3px;color:#1e293b;font-size:12px;font-weight:600;">${pickupAddr || "–"}</p>
<p style="margin:0;color:#6b7280;font-size:11px;">${fmtDateTime(pickup?.datetime || order.pickup_date)}</p>
${pickup?.kilometer ? `<p style="margin:3px 0 0;color:#6b7280;font-size:11px;">KM: ${pickup.kilometer}</p>` : ""}
${pickup?.fuel_level ? `<p style="margin:2px 0 0;color:#6b7280;font-size:11px;">Tank: ${pickup.fuel_level}</p>` : ""}
</div></td>
<td style="vertical-align:middle;text-align:center;width:4%;color:#94a3b8;">&#8594;</td>
<td style="vertical-align:top;width:48%;padding-left:8px;">
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;">
<h3 style="color:#166534;font-size:12px;margin:0 0 8px;">ABGABE</h3>
<p style="margin:0 0 3px;color:#1e293b;font-size:12px;font-weight:600;">${dropoffAddr || "–"}</p>
<p style="margin:0;color:#6b7280;font-size:11px;">${fmtDateTime(dropoff?.datetime || order.dropoff_date)}</p>
${dropoff?.kilometer ? `<p style="margin:3px 0 0;color:#6b7280;font-size:11px;">KM: ${dropoff.kilometer}</p>` : ""}
${dropoff?.fuel_level ? `<p style="margin:2px 0 0;color:#6b7280;font-size:11px;">Tank: ${dropoff.fuel_level}</p>` : ""}
</div></td>
</tr></table>
</div>

<div style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
<h2 style="color:#1e3a5f;font-size:14px;margin:0 0 12px;">Schadensprotokoll</h2>
<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
<tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Bereich</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Art</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Notiz</th></tr>
${damageRows}
</table>
</div>

${order.notes ? `<div style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
<h2 style="color:#1e3a5f;font-size:14px;margin:0 0 8px;">Bemerkungen</h2>
<p style="color:#374151;font-size:12px;line-height:1.6;margin:0;background:#f8fafc;padding:10px;border-radius:6px;">${String(order.notes).replace(/\n/g, "<br>")}</p>
</div>` : ""}

<div style="padding:16px 28px;background:#f8fafc;">
<p style="margin:0;color:#94a3b8;font-size:10px;">Erstellt am ${fmtDate(new Date())} | ${companyName}</p>
${companyInfo ? `<p style="margin:2px 0 0;color:#94a3b8;font-size:10px;">${companyInfo}</p>` : ""}
</div>
</div>
<p style="text-align:center;color:#94a3b8;font-size:10px;margin:12px 0 0;">Automatisch generiert von TransferFleet</p>
</div></body></html>`;
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
      // Token
      let token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) token = (await supabase.auth.refreshSession()).data?.session?.access_token;
      if (!token) throw new Error("Nicht angemeldet.");

      // Daten
      emit({ id: `cp-data-${Date.now()}`, type: "info", message: "Lade Daten..." });
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) throw new Error("Auftrag nicht gefunden.");
      const { data: checklists } = await supabase.from("checklists").select("*").eq("order_id", orderId);
      const pickup = (checklists || []).find((c) => c.type === "pickup");
      const dropoff = (checklists || []).find((c) => c.type === "dropoff");

      // HTML
      emit({ id: `cp-html-${Date.now()}`, type: "info", message: "Erstelle Protokoll..." });
      const htmlBody = buildProtocolHtml(order, pickup, dropoff, getFinanceSettings());

      // Senden — nutze die alte send-driver-assignment API die funktioniert
      emit({ id: `cp-send-${Date.now()}`, type: "info", message: `Sende an ${targetEmail}...` });
      // Logo aus Finance-Settings für PDF mitschicken
      const logoDataUrl = getFinanceSettings()?.invoiceProfile?.logoDataUrl || "";

      const res = await fetch("/api/admin/send-driver-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sendCustomerProtocol: true,
          orderId,
          protocolChecklistId,
          customerProtocolEmail: targetEmail,
          customerProtocolQuality: "normal",
          companyLogoDataUrl: logoDataUrl,
          // Fallback: Wenn Server-PDF fehlschlaegt, sende HTML
          htmlFallback: htmlBody,
        }),
      });

      let ok = false;
      try {
        const payload = await res.json();
        ok = res.ok && payload?.ok;
        if (ok) {
          emit({ id: `cp-ok-${Date.now()}`, type: "success", message: `Protokoll an ${targetEmail} gesendet.` });
          return;
        }
      } catch {}

      // Fallback: HTML-E-Mail ueber send-system-email (ohne PDF)
      emit({ id: `cp-fallback-${Date.now()}`, type: "info", message: "Sende als HTML-E-Mail..." });
      const fallbackRes = await fetch("/api/admin/send-system-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll ${order.order_number || ""} - ${order.license_plate || ""}`,
          htmlBody,
          textBody: `Fahrzeugprotokoll ${order.order_number || ""}\nKennzeichen: ${order.license_plate || ""}\nRoute: ${order.pickup_city || ""} -> ${order.dropoff_city || ""}`,
        }),
      });

      if (fallbackRes.ok) {
        emit({ id: `cp-ok-${Date.now()}`, type: "success", message: `Protokoll an ${targetEmail} gesendet.` });
      } else {
        let errMsg = "Versand fehlgeschlagen.";
        try { const p = await fallbackRes.json(); errMsg = p?.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
    } catch (error) {
      emit({ id: `cp-err-${Date.now()}`, type: "error", message: error?.message || "Versand fehlgeschlagen." });
    }
  })();
};
