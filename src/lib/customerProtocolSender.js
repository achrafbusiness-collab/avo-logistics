import { supabase } from "@/lib/supabaseClient";
import { jsPDF } from "jspdf";
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

const buildProtocolPdf = (order, pickup, dropoff, settings) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const logoUrl = settings?.invoiceProfile?.logoDataUrl;

  // Header
  let y = 15;
  if (logoUrl) {
    try { doc.addImage(logoUrl, "PNG", 15, y, 35, 14); } catch {}
  }
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 95);
  doc.text("FAHRZEUGPROTOKOLL", w / 2, y + 8, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${order.order_number || "–"} • ${order.license_plate || "–"}`, w / 2, y + 14, { align: "center" });

  y = 35;
  doc.setDrawColor(200);
  doc.line(15, y, w - 15, y);
  y += 8;

  // Fahrzeugdaten
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 95);
  doc.text("Fahrzeugdaten", 15, y);
  y += 7;
  doc.setFontSize(9);
  const vehicleData = [
    ["Kennzeichen", order.license_plate || "–"],
    ["Marke / Modell", `${order.vehicle_brand || "–"} ${order.vehicle_model || ""}`.trim()],
    ["Farbe", order.vehicle_color || "–"],
    ["VIN", order.vin || "–"],
  ];
  for (const [label, value] of vehicleData) {
    doc.setTextColor(120); doc.text(label, 17, y);
    doc.setTextColor(30); doc.text(value, 65, y);
    y += 5;
  }

  // Abholung
  y += 5;
  doc.setFontSize(12); doc.setTextColor(30, 58, 95);
  doc.text("Abholung", 15, y);
  y += 7; doc.setFontSize(9);
  const pickupAddr = [order.pickup_address, `${order.pickup_postal_code || ""} ${order.pickup_city || ""}`.trim()].filter(Boolean).join(", ");
  const pickupRows = [
    ["Adresse", pickupAddr || "–"],
    ["Datum", fmtDateTime(pickup?.datetime || order.pickup_date)],
    ["Kilometerstand", pickup?.kilometer ? `${pickup.kilometer} km` : "–"],
    ["Tankstand", pickup?.fuel_level || "–"],
  ];
  for (const [label, value] of pickupRows) {
    doc.setTextColor(120); doc.text(label, 17, y);
    doc.setTextColor(30); doc.text(String(value).slice(0, 80), 65, y);
    y += 5;
  }

  // Abgabe
  y += 5;
  doc.setFontSize(12); doc.setTextColor(30, 58, 95);
  doc.text("Abgabe", 15, y);
  y += 7; doc.setFontSize(9);
  const dropoffAddr = [order.dropoff_address, `${order.dropoff_postal_code || ""} ${order.dropoff_city || ""}`.trim()].filter(Boolean).join(", ");
  const dropoffRows = [
    ["Adresse", dropoffAddr || "–"],
    ["Datum", fmtDateTime(dropoff?.datetime || order.dropoff_date)],
    ["Kilometerstand", dropoff?.kilometer ? `${dropoff.kilometer} km` : "–"],
    ["Tankstand", dropoff?.fuel_level || "–"],
  ];
  for (const [label, value] of dropoffRows) {
    doc.setTextColor(120); doc.text(label, 17, y);
    doc.setTextColor(30); doc.text(String(value).slice(0, 80), 65, y);
    y += 5;
  }

  // Schäden
  const damages = [...(pickup?.damages || []), ...(dropoff?.damages || [])];
  if (damages.length > 0) {
    y += 5;
    doc.setFontSize(12); doc.setTextColor(30, 58, 95);
    doc.text("Schäden", 15, y);
    y += 7; doc.setFontSize(9);
    for (const damage of damages.slice(0, 10)) {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.setTextColor(60);
      doc.text(`${damage.location || "–"}: ${damage.type || "–"}`.slice(0, 90), 17, y);
      y += 4;
      if (damage.note) {
        doc.setTextColor(100);
        doc.text(String(damage.note).slice(0, 90), 20, y);
        y += 4;
      }
    }
  }

  // Notizen
  if (order.notes) {
    y += 5;
    if (y > 260) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setTextColor(30, 58, 95);
    doc.text("Bemerkungen", 15, y);
    y += 7; doc.setFontSize(9); doc.setTextColor(60);
    const lines = doc.splitTextToSize(order.notes, w - 35);
    doc.text(lines, 17, y);
  }

  // Footer
  const footerY = 280;
  doc.setDrawColor(200);
  doc.line(15, footerY, w - 15, footerY);
  doc.setFontSize(7); doc.setTextColor(150);
  const companyName = settings?.invoiceProfile?.companyName || "TransferFleet";
  doc.text(`Erstellt am ${fmtDate(new Date())} • ${companyName}`, 15, footerY + 4);

  return doc;
};

export const sendCustomerProtocolInBackground = ({
  orderId,
  protocolChecklistId,
  customerProtocolEmail,
}) => {
  const targetEmail = String(customerProtocolEmail || "").trim();
  if (!orderId) throw new Error("Auftrag fehlt.");
  if (!targetEmail) throw new Error("Bitte E-Mail-Adresse eingeben.");

  emit({ id: `cp-start-${Date.now()}`, type: "info", message: "Erstelle Protokoll-PDF..." });

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
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) throw new Error("Auftrag nicht gefunden.");

      const { data: checklists } = await supabase.from("checklists").select("*").eq("order_id", orderId);
      const pickup = (checklists || []).find((c) => c.type === "pickup");
      const dropoff = (checklists || []).find((c) => c.type === "dropoff");
      const settings = getFinanceSettings();

      // 3. PDF erstellen
      emit({ id: `cp-pdf-${Date.now()}`, type: "info", message: "Erstelle PDF..." });
      const doc = buildProtocolPdf(order, pickup, dropoff, settings);
      const pdfOutput = doc.output("arraybuffer");
      const bytes = new Uint8Array(pdfOutput);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pdfBase64 = btoa(binary);
      const filename = `protokoll-${order.order_number || orderId.slice(0, 8)}.pdf`;

      // 4. E-Mail senden
      emit({ id: `cp-send-${Date.now()}`, type: "info", message: `Sende an ${targetEmail}...` });
      const res = await fetch("/api/admin/send-system-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll ${order.order_number || ""} – ${order.license_plate || ""}`,
          textBody: `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie das Fahrzeugprotokoll für ${order.license_plate || "das Fahrzeug"} (${order.order_number || ""}).\n\nRoute: ${order.pickup_city || ""} → ${order.dropoff_city || ""}\n\nMit freundlichen Grüßen\nTransferFleet`,
          pdfBase64,
          pdfFilename: filename,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Versand fehlgeschlagen.");

      emit({ id: `cp-success-${Date.now()}`, type: "success", message: `Protokoll-PDF an ${targetEmail} gesendet.` });
    } catch (error) {
      emit({ id: `cp-error-${Date.now()}`, type: "error", message: error?.message || "Versand fehlgeschlagen." });
    }
  })();
};
