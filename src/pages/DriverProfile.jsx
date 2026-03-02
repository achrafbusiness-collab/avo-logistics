import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShieldCheck,
  User,
  Building2,
  Copy,
  Upload,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useI18n } from "@/i18n";

const formatOrderAddress = (address, postalCode, city) => {
  const cityLine = [postalCode, city].filter(Boolean).join(" ");
  return [address, cityLine].filter(Boolean).join(", ");
};

export default function DriverProfile() {
  const { t, formatDate, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [licenseToken, setLicenseToken] = useState(null);
  const [licenseQrUrl, setLicenseQrUrl] = useState("");
  const [licensePublicUrl, setLicensePublicUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [loadingToken, setLoadingToken] = useState(false);
  const [confirmingAddress, setConfirmingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [addressForm, setAddressForm] = useState({
    address: "",
    postal_code: "",
    city: "",
    country: "",
  });
  const [billingRange, setBillingRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  });
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [billingRequestText, setBillingRequestText] = useState("");
  const [billingRequestSending, setBillingRequestSending] = useState(false);
  const [billingRequestError, setBillingRequestError] = useState("");
  const [billingRequestSuccess, setBillingRequestSuccess] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  const { data: drivers = [], isLoading: driverLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => appClient.entities.Driver.list(),
    enabled: !!user,
  });

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => appClient.entities.AppSettings.list("-created_date", 1),
  });

  const appSettings = appSettingsList[0] || null;
  const driver = drivers.find((item) => item.email === user?.email);
  const addressConfirmed = Boolean(driver?.address_confirmed || driver?.address_confirmed_at);
  const docStatus = {
    license_front: Boolean(driver?.license_front),
    license_back: Boolean(driver?.license_back),
    id_card_front: Boolean(driver?.id_card_front),
    id_card_back: Boolean(driver?.id_card_back),
  };
  const allDocumentsUploaded = Object.values(docStatus).every(Boolean);
  const profileComplete = addressConfirmed && allDocumentsUploaded;

  const { data: driverSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ["driver-segments", driver?.id],
    queryFn: () => appClient.entities.OrderSegment.filter({ driver_id: driver?.id }, "-created_date", 200),
    enabled: !!driver?.id,
  });

  const segmentOrderIds = React.useMemo(() => {
    const ids = new Set();
    (driverSegments || []).forEach((segment) => {
      if (segment?.order_id) ids.add(segment.order_id);
    });
    return Array.from(ids);
  }, [driverSegments]);

  const { data: driverOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["driver-orders-by-segments", driver?.id, segmentOrderIds.join(",")],
    queryFn: async () => {
      if (!segmentOrderIds.length) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, license_plate, pickup_address, pickup_postal_code, pickup_city, dropoff_address, dropoff_postal_code, dropoff_city"
        )
        .in("id", segmentOrderIds);
      if (error) {
        console.error("Supabase driver orders error:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!driver?.id && segmentOrderIds.length > 0,
  });

  const { data: driverChecklists = [], isLoading: checklistsLoading } = useQuery({
    queryKey: ["driver-checklists", driver?.id],
    queryFn: () => appClient.entities.Checklist.filter({ driver_id: driver?.id }),
    enabled: !!driver?.id,
  });

  const formatCurrency = (value) =>
    formatNumber(value ?? 0, { style: "currency", currency: "EUR" });

  const expensesByOrder = React.useMemo(() => {
    return (driverChecklists || []).reduce((acc, checklist) => {
      if (!checklist?.order_id || !Array.isArray(checklist.expenses)) return acc;
      const total = checklist.expenses.reduce((sum, expense) => {
        const amount = parseFloat(expense?.amount);
        if (Number.isFinite(amount)) return sum + amount;
        return sum;
      }, 0);
      acc[checklist.order_id] = (acc[checklist.order_id] || 0) + total;
      return acc;
    }, {});
  }, [driverChecklists]);

  const ordersById = React.useMemo(() => {
    return (driverOrders || []).reduce((acc, order) => {
      if (order?.id) acc.set(order.id, order);
      return acc;
    }, new Map());
  }, [driverOrders]);

  const billingRows = React.useMemo(() => {
    const startDate = billingRange.start ? new Date(billingRange.start) : null;
    const endDate = billingRange.end ? new Date(billingRange.end) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    return (driverSegments || [])
      .map((segment) => {
        const dateValue = segment.created_date || segment.created_at;
        const date = dateValue ? new Date(dateValue) : null;
        const priceStatus =
          segment.price_status ||
          (segment.price !== null && segment.price !== undefined ? "approved" : "pending");
        const order = segment?.order_id ? ordersById.get(segment.order_id) : null;
        const isExtraRequest = segment.segment_type === "extra_request";
        const pickupAddress =
          isExtraRequest
            ? segment.start_location || "-"
            : formatOrderAddress(order?.pickup_address, order?.pickup_postal_code, order?.pickup_city) ||
              segment.start_location ||
              "-";
        const dropoffAddress =
          isExtraRequest
            ? "-"
            : formatOrderAddress(order?.dropoff_address, order?.dropoff_postal_code, order?.dropoff_city) ||
              segment.end_location ||
              "-";
        return {
          id: segment.id,
          date,
          dateLabel: date ? formatDate(date) : "-",
          licensePlate: order?.license_plate || segment?.license_plate || "-",
          pickupAddress,
          dropoffAddress,
          isExtraRequest,
          typeLabel:
            segment.segment_type === "shuttle"
              ? t("billing.type.shuttle")
              : segment.segment_type === "extra_request"
                ? t("billing.type.extra")
              : t("billing.type.active"),
          price: Number.isFinite(Number(segment.price)) ? Number(segment.price) : 0,
          priceStatus,
          priceRejectionReason: segment.price_rejection_reason || "",
          expenses: segment.segment_type === "dropoff" ? expensesByOrder[segment.order_id] || 0 : 0,
        };
      })
      .filter((row) => {
        if (!row.date) return false;
        if (startDate && row.date < startDate) return false;
        if (endDate && row.date > endDate) return false;
        return true;
      })
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [billingRange, driverSegments, expensesByOrder, formatDate, ordersById, t]);

  const billingTotals = React.useMemo(() => {
    return billingRows.reduce(
      (acc, row) => {
        if (row.priceStatus === "approved") acc.price += row.price;
        acc.expenses += row.expenses;
        return acc;
      },
      { price: 0, expenses: 0 }
    );
  }, [billingRows]);

  useEffect(() => {
    const loadToken = async () => {
      if (!user) return;
      setLoadingToken(true);
      setTokenError("");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) {
          throw new Error("Nicht angemeldet.");
        }
        const response = await fetch("/api/driver/license-token", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || t("profile.license.error"));
        }
        setLicenseToken(payload.data);
      } catch (err) {
        setTokenError(err?.message || t("profile.license.error"));
      } finally {
        setLoadingToken(false);
      }
    };
    loadToken();
  }, [user, t]);

  useEffect(() => {
    const token = licenseToken?.token;
    if (!token) {
      setLicenseQrUrl("");
      setLicensePublicUrl("");
      return;
    }
    if (typeof window === "undefined") return;

    const profileUrl = `${window.location.origin}/driver-license?token=${encodeURIComponent(token)}`;
    setLicensePublicUrl(profileUrl);
    setQrError("");
    let cancelled = false;

    const createQr = async () => {
      try {
        const qrcode = await import("qrcode");
        const dataUrl = await qrcode.toDataURL(profileUrl, {
          width: 260,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) {
          setLicenseQrUrl(dataUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setQrError("QR-Code konnte nicht erstellt werden.");
        }
      }
    };

    createQr();
    return () => {
      cancelled = true;
    };
  }, [licenseToken?.token]);

  useEffect(() => {
    if (!driver) return;
    setAddressForm({
      address: driver.address || "",
      postal_code: driver.postal_code || "",
      city: driver.city || "",
      country: driver.country || "",
    });
  }, [driver?.id]);

  const handleConfirmAddress = async () => {
    if (!driver?.id) return;
    setConfirmingAddress(true);
    setAddressError("");
    try {
      await appClient.entities.Driver.update(driver.id, {
        address: addressForm.address || null,
        postal_code: addressForm.postal_code || null,
        city: addressForm.city || null,
        country: addressForm.country || null,
        address_confirmed: true,
        address_confirmed_at: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: ["drivers"] });
    } catch (error) {
      setAddressError(error?.message || "Adresse konnte nicht bestätigt werden.");
    } finally {
      setConfirmingAddress(false);
    }
  };

  const handleDocumentUpload = async (field, file) => {
    if (!driver?.id || !file) return;
    setUploadErrors((prev) => ({ ...prev, [field]: "" }));
    setUploadingDocs((prev) => ({ ...prev, [field]: true }));
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      await appClient.entities.Driver.update(driver.id, { [field]: file_url });
      await queryClient.invalidateQueries({ queryKey: ["drivers"] });
    } catch (error) {
      setUploadErrors((prev) => ({
        ...prev,
        [field]: error?.message || "Upload fehlgeschlagen. Bitte erneut versuchen.",
      }));
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleSendBillingRequest = async () => {
    const text = billingRequestText.replace(/\s+/g, " ").trim();
    setBillingRequestError("");
    setBillingRequestSuccess("");

    if (!text) {
      setBillingRequestError(t("billing.request.required"));
      return;
    }
    if (!driver?.id) {
      setBillingRequestError(t("billing.request.error"));
      return;
    }

    const driverName =
      [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() ||
      user?.full_name ||
      driver.email ||
      user?.email ||
      t("orders.driverFallback");

    setBillingRequestSending(true);
    try {
      const nowIso = new Date().toISOString();
      await appClient.entities.OrderSegment.create({
        order_id: null,
        company_id: driver.company_id || null,
        driver_id: driver.id,
        driver_name: driverName,
        segment_type: "extra_request",
        start_location: text,
        end_location: "",
        distance_km: null,
        price: null,
        price_status: "pending",
        price_rejection_reason: null,
        created_date: nowIso,
      });
      setBillingRequestText("");
      setRequestDialogOpen(false);
      setBillingRequestSuccess(t("billing.request.success"));
      queryClient.invalidateQueries({ queryKey: ["driver-segments", driver.id] });
      queryClient.invalidateQueries({ queryKey: ["driver-price-requests"] });
      queryClient.invalidateQueries({ queryKey: ["order-segments"], exact: false });
    } catch (error) {
      setBillingRequestError(error?.message || t("billing.request.error"));
    } finally {
      setBillingRequestSending(false);
    }
  };

  const DocumentUploadField = ({ label, field }) => {
    const value = driver?.[field];
    const isUploading = uploadingDocs[field];
    const fieldError = uploadErrors[field];
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {value ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Hochgeladen</span>
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#1e3a5f] underline underline-offset-2"
              >
                Anzeigen
              </a>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600 transition">
              <Upload className="h-3 w-3" />
              <span>{isUploading ? "Hochladen..." : "Ersetzen"}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => handleDocumentUpload(field, e.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <label
            className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition ${
              isUploading
                ? "cursor-wait border-slate-200 bg-slate-50 text-slate-400"
                : "cursor-pointer border-slate-300 bg-white text-slate-500 hover:border-[#1e3a5f] hover:bg-slate-50"
            }`}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Upload className="h-4 w-4 text-slate-400" />
            )}
            <span>{isUploading ? "Hochladen..." : "Foto / Scan auswählen"}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => handleDocumentUpload(field, e.target.files?.[0])}
            />
          </label>
        )}
        {fieldError && (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {fieldError}
          </p>
        )}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("profile.title")}</h1>
        <p className="text-sm text-slate-500">{t("profile.subtitle")}</p>
      </div>

      {/* Persönliche Info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
              <User className="h-6 w-6 text-slate-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {driver?.first_name || driver?.last_name
                  ? `${driver?.first_name || ""} ${driver?.last_name || ""}`.trim()
                  : user.full_name || user.email}
              </p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              {appSettings?.company_name || t("app.name")}
            </div>
            {driver?.phone && <p>{t("profile.phone")}: {driver.phone}</p>}
            {driver?.city && <p>{t("profile.city")}: {driver.city}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Profil-Status Übersicht */}
      <Card className={`border ${profileComplete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {profileComplete ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Clock className="h-5 w-5 text-amber-600" />
            )}
            <h2 className={`font-semibold ${profileComplete ? "text-emerald-800" : "text-amber-800"}`}>
              {profileComplete ? "Profil vollständig" : "Profil unvollständig"}
            </h2>
          </div>
          {!profileComplete && (
            <p className="text-sm text-amber-700">
              Du kannst Aufträge durchführen. Bitte vervollständige dein Profil, damit dein Disponent alles einsehen kann.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatusItem
              label="Adresse bestätigt"
              done={addressConfirmed}
            />
            <StatusItem label="Führerschein Vorderseite" done={docStatus.license_front} />
            <StatusItem label="Führerschein Rückseite" done={docStatus.license_back} />
            <StatusItem label="Ausweis Vorderseite" done={docStatus.id_card_front} />
            <StatusItem label="Ausweis Rückseite" done={docStatus.id_card_back} />
          </div>
        </CardContent>
      </Card>

      {/* Adresse */}
      <Card className="border border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="font-medium">Adresse</span>
            {addressConfirmed && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
          </div>

          {addressConfirmed ? (
            <div className="text-sm text-slate-600 space-y-1">
              <p>{driver?.address || "Keine Adresse hinterlegt."}</p>
              <p>{[driver?.postal_code, driver?.city].filter(Boolean).join(" ")}</p>
              <p>{driver?.country || ""}</p>
              <div className="flex items-center gap-1 text-emerald-700 pt-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs">Adresse bestätigt</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">Straße & Hausnummer</label>
                  <Input
                    value={addressForm.address}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="z.B. Musterstraße 12"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">PLZ</label>
                  <Input
                    value={addressForm.postal_code}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, postal_code: e.target.value }))}
                    placeholder="z.B. 40210"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Stadt</label>
                  <Input
                    value={addressForm.city}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="z.B. Düsseldorf"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">Land</label>
                  <Input
                    value={addressForm.country}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, country: e.target.value }))}
                    placeholder="Deutschland"
                  />
                </div>
              </div>
              {addressError && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {addressError}
                </p>
              )}
              <Button
                type="button"
                onClick={handleConfirmAddress}
                disabled={confirmingAddress || !addressForm.address.trim()}
                className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              >
                {confirmingAddress ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Adresse bestätigen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dokumente */}
      <Card className="border border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            <span className="font-medium">Dokumente hochladen</span>
            {allDocumentsUploaded && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <DocumentUploadField label="Führerschein Vorderseite" field="license_front" />
            <DocumentUploadField label="Führerschein Rückseite" field="license_back" />
            <DocumentUploadField label="Ausweis Vorderseite" field="id_card_front" />
            <DocumentUploadField label="Ausweis Rückseite" field="id_card_back" />
          </div>
        </CardContent>
      </Card>

      {/* Tagesausweis */}
      <Card className="border border-emerald-200 bg-emerald-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="font-semibold">{t("profile.license.title")}</h2>
          </div>
          <p className="text-sm text-emerald-700">{t("profile.license.description")}</p>
          {loadingToken ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("profile.license.loading")}
            </div>
          ) : tokenError ? (
            <p className="text-sm text-red-600">{tokenError}</p>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-slate-700">
              <p className="text-xs text-slate-400">{t("profile.license.validOn")}</p>
              <p className="font-semibold">{licenseToken?.day}</p>
              {licenseQrUrl ? (
                <div className="mt-3 flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <img
                    src={licenseQrUrl}
                    alt="Persönlicher QR-Code"
                    className="h-48 w-48 rounded-md bg-white p-2"
                  />
                  <p className="mt-2 text-center text-xs text-slate-500">
                    QR-Code scannen für verifizierbares Fahrerprofil.
                  </p>
                </div>
              ) : qrError ? (
                <p className="mt-3 text-sm text-red-600">{qrError}</p>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  QR-Code wird erstellt...
                </div>
              )}
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-400">{t("profile.license.tokenId")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-xs break-all">{licenseToken?.token}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard?.writeText(licenseToken?.token || "")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {licensePublicUrl ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={licensePublicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#1e3a5f] underline underline-offset-2"
                    >
                      Verifizierungs-Link öffnen
                    </a>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard?.writeText(licensePublicUrl)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">{t("profile.license.securityNote")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abrechnung */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("billing.title")}</h2>
              <p className="text-sm text-slate-500">{t("billing.subtitle")}</p>
            </div>
            <Button
              type="button"
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={() => {
                setBillingRequestError("");
                setRequestDialogOpen(true);
              }}
            >
              {t("billing.request.button")}
            </Button>
            <div className="flex gap-2 flex-wrap">
              <div>
                <label className="text-xs text-slate-500">{t("billing.rangeStart")}</label>
                <Input
                  type="date"
                  value={billingRange.start}
                  onChange={(e) => setBillingRange((prev) => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t("billing.rangeEnd")}</label>
                <Input
                  type="date"
                  value={billingRange.end}
                  onChange={(e) => setBillingRange((prev) => ({ ...prev, end: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => {
              const date = new Date().toISOString().slice(0, 10);
              setBillingRange({ start: date, end: date });
            }}>{t("billing.quick.today")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              const day = new Date();
              day.setDate(day.getDate() - 1);
              const date = day.toISOString().slice(0, 10);
              setBillingRange({ start: date, end: date });
            }}>{t("billing.quick.yesterday")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              const day = new Date();
              day.setDate(day.getDate() - 2);
              const date = day.toISOString().slice(0, 10);
              setBillingRange({ start: date, end: date });
            }}>{t("billing.quick.dayBefore")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 7);
              setBillingRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
            }}>{t("billing.quick.weekAgo")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
              setBillingRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
            }}>{t("billing.quick.thisMonth")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const end = new Date(now.getFullYear(), now.getMonth(), 0);
              setBillingRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
            }}>{t("billing.quick.lastMonth")}</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t("billing.totalEarnings")}</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(billingTotals.price)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t("billing.totalExpenses")}</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(billingTotals.expenses)}</p>
            </div>
          </div>
          {billingRequestSuccess ? (
            <p className="text-sm text-emerald-600">{billingRequestSuccess}</p>
          ) : null}

          {ordersLoading || checklistsLoading || segmentsLoading || driverLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("billing.loading")}
            </div>
          ) : billingRows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("billing.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-4">{t("billing.table.date")}</th>
                    <th className="py-2 pr-4">{t("billing.table.plate")}</th>
                    <th className="py-2 pr-4">{t("billing.table.tour")}</th>
                    <th className="py-2 pr-4">{t("billing.table.type")}</th>
                    <th className="py-2 pr-4">{t("billing.table.status")}</th>
                    <th className="py-2 pr-4 text-right">{t("billing.table.price")}</th>
                    <th className="py-2 text-right">{t("billing.table.expenses")}</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="py-2 pr-4">{row.dateLabel}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.licensePlate}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {row.isExtraRequest ? (
                          <div>
                            <span className="text-xs font-medium text-slate-500">{t("billing.table.request")}:</span>{" "}
                            <span>{row.pickupAddress || "-"}</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div>
                              <span className="text-xs font-medium text-slate-500">{t("billing.table.pickup")}:</span>{" "}
                              <span>{row.pickupAddress || "-"}</span>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500">{t("billing.table.dropoff")}:</span>{" "}
                              <span>{row.dropoffAddress || "-"}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{row.typeLabel}</td>
                      <td className="py-2 pr-4 text-sm">
                        <div className="flex flex-col gap-1">
                          <span>
                            {row.priceStatus === "approved" ? "✅" : row.priceStatus === "rejected" ? "❌" : "⏳"}{" "}
                            {t(`billing.status.${row.priceStatus}`)}
                          </span>
                          {row.priceStatus === "rejected" && row.priceRejectionReason ? (
                            <span className="text-xs text-red-600">{row.priceRejectionReason}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {row.priceStatus === "approved" ? formatCurrency(row.price) : "-"}
                      </td>
                      <td className="py-2 text-right">{formatCurrency(row.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("billing.request.title")}</DialogTitle>
            <DialogDescription>{t("billing.request.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{t("billing.request.label")}</label>
            <Textarea
              rows={5}
              value={billingRequestText}
              onChange={(e) => setBillingRequestText(e.target.value)}
              placeholder={t("billing.request.placeholder")}
              maxLength={600}
            />
            <p className="text-xs text-slate-500">{billingRequestText.length} / 600</p>
            {billingRequestError ? (
              <p className="text-sm text-red-600">{billingRequestError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestDialogOpen(false)}
              disabled={billingRequestSending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={handleSendBillingRequest}
              disabled={billingRequestSending}
            >
              {billingRequestSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {billingRequestSending ? t("billing.request.sending") : t("billing.request.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusItem({ label, done }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
      done ? "bg-emerald-100 text-emerald-800" : "bg-white border border-amber-200 text-amber-700"
    }`}>
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-amber-500" />
      )}
      <span>{label}</span>
    </div>
  );
}
