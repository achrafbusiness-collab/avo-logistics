import { supabase } from "@/lib/supabaseClient";

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
      // Ignore listener errors to keep notifications robust.
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
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }

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
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Versand fehlgeschlagen.");
      }

      emit({
        id: `customer-protocol-success-${Date.now()}`,
        type: "success",
        message: `E-Mail erfolgreich an ${payload?.data?.to || targetEmail} gesendet.`,
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
