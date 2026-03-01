import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Loader2, ExternalLink, AlertTriangle, Phone, Mail } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE");
};

const statusLabel = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "in_transit") return "In Bearbeitung";
  if (normalized === "shuttle") return "Shuttle";
  if (normalized === "new") return "Neu";
  if (normalized === "completed") return "Abgeschlossen";
  if (normalized === "cancelled") return "Storniert";
  return value || "-";
};

export default function DriverLicensePublic() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError("Kein Token vorhanden.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/driver/license-profile?token=${encodeURIComponent(token)}`
        );
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Verifizierung fehlgeschlagen.");
        }
        setPayload(data.data || null);
      } catch (err) {
        setError(err?.message || "Verifizierung fehlgeschlagen.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const hasLicense = useMemo(
    () => Boolean(payload?.documents?.driverLicenseFront || payload?.documents?.driverLicenseBack),
    [payload]
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Fahrer-Verifizierung</h1>
              <p className="text-sm text-slate-500">
                Tages-Lizenzschein mit Profil- und Berechtigungsnachweis
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifizierung läuft...
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Verifizierung fehlgeschlagen</p>
                <p>{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && payload ? (
          <>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-medium text-emerald-800">Identität bestätigt</p>
              <p className="text-sm text-emerald-800">
                Fahrer: <strong>{payload.driver?.name || "-"}</strong>
              </p>
              <p className="text-sm text-emerald-700">
                Unternehmen: <strong>{payload.company?.name || "-"}</strong>
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Gültig am {payload.validOn || "-"} • Geprüft um {formatDateTime(payload.verifiedAt)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Profil
              </h2>
              <div className="space-y-1 text-sm text-slate-700">
                <p>Name: {payload.driver?.name || "-"}</p>
                <p>E-Mail: {payload.driver?.email || "-"}</p>
                <p>Telefon: {payload.driver?.phone || "-"}</p>
                <p>Ort: {[payload.driver?.city, payload.driver?.country].filter(Boolean).join(", ") || "-"}</p>
                {payload.company?.supportPhone ? (
                  <p className="flex items-center gap-2 pt-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    Support: {payload.company.supportPhone}
                  </p>
                ) : null}
                {payload.company?.supportEmail ? (
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    Support: {payload.company.supportEmail}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Berechtigung
              </h2>
              <p className="text-sm text-slate-700">{payload.authorization?.text || "-"}</p>
              {payload.authorization?.powerOfAttorney?.fileUrl ? (
                <a
                  href={payload.authorization.powerOfAttorney.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#1e3a5f] underline underline-offset-2"
                >
                  Vollmacht anzeigen
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <p className="mt-3 text-sm text-amber-700">
                  Keine separate Vollmacht-Datei hinterlegt.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Führerschein
              </h2>
              {!hasLicense ? (
                <p className="text-sm text-amber-700">Kein Führerschein-Dokument hinterlegt.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {payload.documents?.driverLicenseFront ? (
                    <a
                      href={payload.documents.driverLicenseFront}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-slate-200 p-2 text-sm text-slate-700 hover:border-slate-300"
                    >
                      <img
                        src={payload.documents.driverLicenseFront}
                        alt="Führerschein Vorderseite"
                        className="h-44 w-full rounded-md object-contain bg-slate-50"
                      />
                      <p className="mt-2 font-medium">Vorderseite</p>
                    </a>
                  ) : null}
                  {payload.documents?.driverLicenseBack ? (
                    <a
                      href={payload.documents.driverLicenseBack}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-slate-200 p-2 text-sm text-slate-700 hover:border-slate-300"
                    >
                      <img
                        src={payload.documents.driverLicenseBack}
                        alt="Führerschein Rückseite"
                        className="h-44 w-full rounded-md object-contain bg-slate-50"
                      />
                      <p className="mt-2 font-medium">Rückseite</p>
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Aktive Aufträge
              </h2>
              {payload.activeOrders?.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-3">Auftrag</th>
                        <th className="py-2 pr-3">Kennzeichen</th>
                        <th className="py-2 pr-3">Route</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.activeOrders.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-2 pr-3">{item.orderNumber}</td>
                          <td className="py-2 pr-3">{item.plate}</td>
                          <td className="py-2 pr-3">{item.route}</td>
                          <td className="py-2">{statusLabel(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Aktuell keine aktiven Aufträge gefunden.</p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
