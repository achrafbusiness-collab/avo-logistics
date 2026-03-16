import { supabase } from "@/lib/supabaseClient";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const listeners = new Set();

const QUALITY_LABELS = {
  high: "Gute Qualität",
  normal: "Normale Qualität",
  economy: "Günstige Qualität",
};

const emit = (event) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  });
};

const normalizeQuality = (value) => {
  const normalized = String(value || "normal").trim().toLowerCase();
  if (normalized === "high" || normalized === "normal" || normalized === "economy") {
    return normalized;
  }
  return "normal";
};

export const subscribeCustomerProtocolNotifications = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const sendCustomerProtocolInBackground = ({
  orderId,
  protocolChecklistId,
  customerProtocolEmail,
  customerProtocolQuality,
}) => {
  const targetEmail = String(customerProtocolEmail || "").trim();
  const quality = normalizeQuality(customerProtocolQuality);
  if (!orderId) {
    throw new Error("Auftrag fehlt.");
  }
  if (!targetEmail) {
    throw new Error("Bitte E-Mail-Adresse eingeben.");
  }

  emit({
    id: `customer-protocol-start-${Date.now()}`,
    type: "info",
    message: `Versand gestartet (${QUALITY_LABELS[quality]}).`,
  });

  void (async () => {
    try {
      let token = null;
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
      }
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }

      // Versuche zuerst Server-seitige PDF-Generierung
      try {
        const response = await fetch("/api/admin/send-driver-assignment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            protocolChecklistId,
            sendCustomerProtocol: true,
            customerProtocolEmail: targetEmail,
            customerProtocolQuality: quality,
          }),
        });

        const payload = await response.json();
        if (response.ok && payload?.ok) {
          emit({
            id: `customer-protocol-success-${Date.now()}`,
            type: "success",
            message: `E-Mail erfolgreich an ${payload?.data?.to || targetEmail} gesendet.`,
          });
          return;
        }
      } catch {
        // Server-seitig fehlgeschlagen → Fallback
      }

      // Fallback: Client-seitige PDF-Generierung
      emit({
        id: `customer-protocol-fallback-${Date.now()}`,
        type: "info",
        message: "Erstelle PDF lokal...",
      });

      // Finde die Protokoll-Seiten im DOM
      const pages = document.querySelectorAll(".pdf-page");
      if (!pages.length) {
        throw new Error("Protokoll-Seiten nicht im DOM gefunden.");
      }

      const scale = quality === "high" ? 2 : quality === "economy" ? 1 : 1.5;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) doc.addPage();
        const canvas = await html2canvas(pages[i], {
          scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.85);
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const filename = `protokoll-${orderId.slice(0, 8)}.pdf`;

      // Sende über die System-E-Mail API
      const emailResponse = await fetch("/api/send-system-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientEmail: targetEmail,
          subject: `Fahrzeugprotokoll – TransferFleet`,
          textBody: `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie das Fahrzeugprotokoll.\n\nMit freundlichen Grüßen\nTransferFleet`,
          pdfBase64,
          pdfFilename: filename,
        }),
      });

      const emailPayload = await emailResponse.json();
      if (!emailResponse.ok || !emailPayload?.ok) {
        throw new Error(emailPayload?.error || "E-Mail-Versand fehlgeschlagen.");
      }

      emit({
        id: `customer-protocol-success-${Date.now()}`,
        type: "success",
        message: `E-Mail erfolgreich an ${targetEmail} gesendet.`,
      });
    } catch (error) {
      emit({
        id: `customer-protocol-error-${Date.now()}`,
        type: "error",
        message: error?.message || "Versand fehlgeschlagen.",
      });
    }
  })();
};
