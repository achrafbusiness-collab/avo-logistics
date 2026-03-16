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

const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("de-DE");
};

const formatDateTime = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
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
      // 1. Token holen
      emit({ id: `cp-auth-${Date.now()}`, type: "info", message: "Authentifizierung..." });
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

      // 3. PDF erstellen
      emit({ id: `cp-pdf-${Date.now()}`, type: "info", message: "Erstelle PDF..." });
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      const settings = getFinanceSettings();
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
      doc.text(`${order.order_number || "-"} • ${order.license_plate || "-"}`, w / 2, y + 14, { align: "center" });

      // Linie
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
      doc.setTextColor(60);
      const vehicleData = [
        ["Kennzeichen", order.license_plate || "-"],
        ["Marke / Modell", `${order.vehicle_brand || "-"} ${order.vehicle_model || ""}`.trim()],
        ["Farbe", order.vehicle_color || "-"],
        ["VIN", order.vin || "-"],
      ];
      for (const [label, value] of vehicleData) {
        doc.setTextColor(120);
        doc.text(label, 17, y);
        doc.setTextColor(30);
        doc.text(value, 65, y);
        y += 5;
      }

      // Abholung
      y += 5;
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 95);
      doc.text("Abholung", 15, y);
      y += 7;
      doc.setFontSize(9);
      const pickupData = [
        ["Adresse", `${order.pickup_address || ""}, ${order.pickup_postal_code || ""} ${order.pickup_city || ""}`.trim()],
        ["Datum", formatDateTime(pickup?.datetime || order.pickup_date)],
        ["Kilometerstand", pickup?.kilometer ? `${pickup.kilometer} km` : "-"],
        ["Tankstand", pickup?.fuel_level || "-"],
        ["Standort bestätigt", pickup?.location_confirmed === false ? `Nein – ${pickup?.location || ""}` : "Ja"],
      ];
      for (const [label, value] of pickupData) {
        doc.setTextColor(120);
        doc.text(label, 17, y);
        doc.setTextColor(30);
        doc.text(String(value).slice(0, 80), 65, y);
        y += 5;
      }

      // Abgabe
      y += 5;
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 95);
      doc.text("Abgabe", 15, y);
      y += 7;
      doc.setFontSize(9);
      const dropoffData = [
        ["Adresse", `${order.dropoff_address || ""}, ${order.dropoff_postal_code || ""} ${order.dropoff_city || ""}`.trim()],
        ["Datum", formatDateTime(dropoff?.datetime || order.dropoff_date)],
        ["Kilometerstand", dropoff?.kilometer ? `${dropoff.kilometer} km` : "-"],
        ["Tankstand", dropoff?.fuel_level || "-"],
      ];
      for (const [label, value] of dropoffData) {
        doc.setTextColor(120);
        doc.text(label, 17, y);
        doc.setTextColor(30);
        doc.text(String(value).slice(0, 80), 65, y);
        y += 5;
      }

      // Schäden
      const allDamages = [...(pickup?.damages || []), ...(dropoff?.damages || [])];
      if (allDamages.length > 0) {
        y += 5;
        doc.setFontSize(12);
        doc.setTextColor(30, 58, 95);
        doc.text("Schäden", 15, y);
        y += 7;
        doc.setFontSize(9);
        for (const damage of allDamages.slice(0, 10)) {
          if (y > 270) { doc.addPage(); y = 15; }
          doc.setTextColor(60);
          const label = `${damage.location || "-"}: ${damage.type || "-"}`;
          doc.text(label.slice(0, 90), 17, y);
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
        doc.setFontSize(12);
        doc.setTextColor(30, 58, 95);
        doc.text("Bemerkungen", 15, y);
        y += 7;
        doc.setFontSize(9);
        doc.setTextColor(60);
        const noteLines = doc.splitTextToSize(order.notes, w - 35);
        doc.text(noteLines, 17, y);
        y += noteLines.length * 4;
      }

      // Footer
      y += 10;
      if (y > 270) { doc.addPage(); y = 15; }
      doc.setDrawColor(200);
      doc.line(15, y, w - 15, y);
      y += 5;
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Erstellt am ${new Date().toLocaleDateString("de-DE")} • TransferFleet`, 15, y);

      // Output als Base64 — komprimiert
      const pdfBlob = doc.output("blob");
      const pdfBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(pdfBlob);
      });
      const filename = `protokoll-${order.order_number || orderId.slice(0, 8)}.pdf`;

      // 4. E-Mail senden
      emit({ id: `cp-send-${Date.now()}`, type: "info", message: `Sende E-Mail an ${targetEmail}...` });
      const emailResponse = await fetch("/api/send-system-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll ${order.order_number || ""} – ${order.license_plate || ""}`,
          textBody: `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie das Fahrzeugprotokoll für ${order.license_plate || "das Fahrzeug"} (${order.order_number || ""}).\n\nRoute: ${order.pickup_city || ""} → ${order.dropoff_city || ""}\n\nMit freundlichen Grüßen\nTransferFleet`,
          pdfBase64,
          pdfFilename: filename,
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
