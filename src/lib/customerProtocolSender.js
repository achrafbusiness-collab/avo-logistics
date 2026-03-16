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

const safeText = (v, max = 80) => String(v || "–").slice(0, max);

const addRow = (doc, label, value, y, w) => {
  doc.setTextColor(120);
  doc.text(label, 17, y);
  doc.setTextColor(30);
  doc.text(safeText(value), 65, y);
};

const buildPdf = (order, pickup, dropoff, settings) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // Header — kein Logo (vermeidet addImage-Fehler)
  let y = 15;
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 95);
  doc.text("FAHRZEUGPROTOKOLL", w / 2, y + 4, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(safeText(`${order.order_number || ""} \u2022 ${order.license_plate || ""}`, 60), w / 2, y + 11, { align: "center" });

  y = 32;
  doc.setDrawColor(200);
  doc.line(15, y, w - 15, y);
  y += 8;

  // Fahrzeug
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 95);
  doc.text("Fahrzeugdaten", 15, y);
  y += 7;
  doc.setFontSize(9);
  addRow(doc, "Kennzeichen", order.license_plate, y); y += 5;
  addRow(doc, "Marke / Modell", `${order.vehicle_brand || ""} ${order.vehicle_model || ""}`.trim() || "–", y); y += 5;
  addRow(doc, "Farbe", order.vehicle_color, y); y += 5;
  if (order.vin) { addRow(doc, "VIN", order.vin, y); y += 5; }

  // Abholung
  y += 5;
  doc.setFontSize(12); doc.setTextColor(30, 58, 95);
  doc.text("Abholung", 15, y); y += 7; doc.setFontSize(9);
  const pAddr = [order.pickup_address, `${order.pickup_postal_code || ""} ${order.pickup_city || ""}`.trim()].filter(Boolean).join(", ");
  addRow(doc, "Adresse", pAddr, y); y += 5;
  addRow(doc, "Datum", fmtDateTime(pickup?.datetime || order.pickup_date), y); y += 5;
  addRow(doc, "KM-Stand", pickup?.kilometer ? `${pickup.kilometer} km` : "–", y); y += 5;
  addRow(doc, "Tankstand", pickup?.fuel_level || "–", y); y += 5;

  // Abgabe
  y += 5;
  doc.setFontSize(12); doc.setTextColor(30, 58, 95);
  doc.text("Abgabe", 15, y); y += 7; doc.setFontSize(9);
  const dAddr = [order.dropoff_address, `${order.dropoff_postal_code || ""} ${order.dropoff_city || ""}`.trim()].filter(Boolean).join(", ");
  addRow(doc, "Adresse", dAddr, y); y += 5;
  addRow(doc, "Datum", fmtDateTime(dropoff?.datetime || order.dropoff_date), y); y += 5;
  addRow(doc, "KM-Stand", dropoff?.kilometer ? `${dropoff.kilometer} km` : "–", y); y += 5;
  addRow(doc, "Tankstand", dropoff?.fuel_level || "–", y); y += 5;

  // Schäden
  const damages = [...(pickup?.damages || []), ...(dropoff?.damages || [])];
  if (damages.length > 0) {
    y += 5;
    doc.setFontSize(12); doc.setTextColor(30, 58, 95);
    doc.text("Schaeden", 15, y); y += 7; doc.setFontSize(9);
    for (const d of damages.slice(0, 10)) {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.setTextColor(60);
      doc.text(safeText(`${d.location || ""}: ${d.type || ""}`, 90), 17, y); y += 4;
      if (d.note) { doc.setTextColor(100); doc.text(safeText(d.note, 90), 20, y); y += 4; }
    }
  }

  // Notizen
  if (order.notes) {
    y += 5;
    if (y > 260) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setTextColor(30, 58, 95);
    doc.text("Bemerkungen", 15, y); y += 7;
    doc.setFontSize(9); doc.setTextColor(60);
    const lines = doc.splitTextToSize(String(order.notes).slice(0, 500), w - 35);
    doc.text(lines, 17, y);
  }

  // Footer
  doc.setDrawColor(200);
  doc.line(15, 280, w - 15, 280);
  doc.setFontSize(7); doc.setTextColor(150);
  const cn = settings?.invoiceProfile?.companyName || "TransferFleet";
  doc.text(`Erstellt am ${fmtDate(new Date())} - ${cn}`, 15, 284);

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

      // PDF
      emit({ id: `cp-pdf-${Date.now()}`, type: "info", message: "Erstelle PDF..." });
      const doc = buildPdf(order, pickup, dropoff, getFinanceSettings());

      // Base64 — sicher über Blob + FileReader
      const base64 = await new Promise((resolve, reject) => {
        try {
          const blob = doc.output("blob");
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const dataUrl = reader.result;
              const idx = dataUrl.indexOf(",");
              resolve(idx >= 0 ? dataUrl.substring(idx + 1) : "");
            } catch (e) { reject(e); }
          };
          reader.onerror = () => reject(new Error("PDF lesen fehlgeschlagen."));
          reader.readAsDataURL(blob);
        } catch (e) { reject(e); }
      });

      if (!base64 || base64.length < 100) throw new Error("PDF-Erstellung fehlgeschlagen.");

      const filename = `protokoll-${(order.order_number || orderId).replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;

      // Senden
      emit({ id: `cp-send-${Date.now()}`, type: "info", message: `Sende an ${targetEmail}...` });
      const res = await fetch("/api/admin/send-system-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll ${order.order_number || ""} - ${order.license_plate || ""}`,
          textBody: [
            "Sehr geehrte Damen und Herren,",
            "",
            `anbei erhalten Sie das Fahrzeugprotokoll fuer ${order.license_plate || "das Fahrzeug"} (${order.order_number || ""}).`,
            "",
            `Route: ${order.pickup_city || ""} -> ${order.dropoff_city || ""}`,
            "",
            "Mit freundlichen Gruessen",
            "TransferFleet",
          ].join("\n"),
          pdfBase64: base64,
          pdfFilename: filename,
        }),
      });

      if (!res.ok) {
        let errMsg = "Versand fehlgeschlagen.";
        try { const p = await res.json(); errMsg = p?.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      emit({ id: `cp-ok-${Date.now()}`, type: "success", message: `Protokoll-PDF an ${targetEmail} gesendet.` });
    } catch (error) {
      emit({ id: `cp-err-${Date.now()}`, type: "error", message: error?.message || "Versand fehlgeschlagen." });
    }
  })();
};
