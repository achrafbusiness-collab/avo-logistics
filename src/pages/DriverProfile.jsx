import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, User, Building2, Copy, Upload, Image } from "lucide-react";
import { useI18n } from "@/i18n";

export default function DriverProfile() {
  const { t, formatDate, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
  const [licenseToken, setLicenseToken] = useState(null);
  const [tokenError, setTokenError] = useState("");
  const [loadingToken, setLoadingToken] = useState(false);
  const [confirmingAddress, setConfirmingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [uploadError, setUploadError] = useState("");
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
  const driverEmail = normalizeEmail(user?.email);
  const driver = drivers.find((item) => normalizeEmail(item.email) === driverEmail);
  const addressConfirmed = Boolean(driver?.address_confirmed || driver?.address_confirmed_at);
  const allDocumentsUploaded = Boolean(
    driver?.license_front &&
      driver?.license_back &&
      driver?.id_card_front &&
      driver?.id_card_back
  );

  const { data: driverOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["driver-orders", driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, license_plate")
        .eq("assigned_driver_id", driver.id)
        .order("created_date", { ascending: false });
      if (error) {
        console.error("Supabase driver orders error:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!driver?.id,
  });

  const { data: driverSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ["driver-segments", driver?.id, billingRange.start, billingRange.end],
    queryFn: async () => {
      if (!driver?.id) return [];
      const driverName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
      const safeName = driverName.replace(/,/g, " ").trim();
      const startIso = billingRange.start ? `${billingRange.start}T00:00:00` : null;
      const endIso = billingRange.end ? `${billingRange.end}T23:59:59` : null;
      let query = supabase
        .from("order_segments")
        .select("*")
        .order("created_date", { ascending: false })
        .limit(500);
      if (startIso) query = query.gte("created_date", startIso);
      if (endIso) query = query.lte("created_date", endIso);
      if (driver?.id && safeName) {
        query = query.or(`driver_id.eq.${driver.id},driver_name.ilike.*${safeName}*`);
      } else if (driver?.id) {
        query = query.eq("driver_id", driver.id);
      } else if (safeName) {
        query = query.ilike("driver_name", `%${safeName}%`);
      }
      const { data, error } = await query;
      if (error) {
        console.error("Supabase driver segments error:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!driver?.id,
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
        if (Number.isFinite(amount)) {
          return sum + amount;
        }
        return sum;
      }, 0);
      acc[checklist.order_id] = (acc[checklist.order_id] || 0) + total;
      return acc;
    }, {});
  }, [driverChecklists]);

  const ordersById = React.useMemo(() => {
    return (driverOrders || []).reduce((acc, order) => {
      if (order?.id) {
        acc.set(order.id, order);
      }
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
        return {
          id: segment.id,
          date,
          dateLabel: date ? formatDate(date) : "-",
          licensePlate: ordersById.get(segment.order_id)?.license_plate || "-",
          tour: `${segment.start_location || ""} → ${segment.end_location || ""}`.trim(),
          typeLabel:
            segment.segment_type === "shuttle"
              ? t("billing.type.shuttle")
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
        if (row.priceStatus === "approved") {
          acc.price += row.price;
        }
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
        const { data } = await appClient.auth.getSession();
        const token = data?.session?.access_token;
        const response = await fetch("/api/driver/license-token", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
    setUploadError("");
    setUploadingDocs((prev) => ({ ...prev, [field]: true }));
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      await appClient.entities.Driver.update(driver.id, { [field]: file_url });
      await queryClient.invalidateQueries({ queryKey: ["drivers"] });
    } catch (error) {
      setUploadError(error?.message || "Dokument konnte nicht hochgeladen werden.");
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [field]: false }));
    }
  };

  const DocumentUploadField = ({ label, field }) => {
    const value = driver?.[field];
    const isUploading = uploadingDocs[field];
    const locked = addressConfirmed;
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {value ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            <span>Dokument hochgeladen</span>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#1e3a5f] underline underline-offset-2"
            >
              Anzeigen
            </a>
          </div>
        ) : (
          <label
            className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition ${
              locked
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                : "cursor-pointer border-slate-200 bg-white text-slate-500 hover:border-[#1e3a5f] hover:bg-slate-50"
            }`}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Upload className="h-4 w-4 text-slate-400" />
            )}
            <span>
              {locked ? "Upload nach Bestätigung gesperrt" : isUploading ? "Hochladen..." : "Foto/Scan auswählen"}
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={isUploading || locked}
              onChange={(event) => handleDocumentUpload(field, event.target.files?.[0])}
            />
          </label>
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

      <Card className="border border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Profil bestätigen</h2>
            <p className="text-sm text-slate-500">
              Bitte bestätige einmalig deine Adresse und lade deine Dokumente hoch.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="font-medium">Adresse</span>
            </div>
            {addressConfirmed ? (
              <div className="text-sm text-slate-600">
                <p>{driver?.address || "Keine Adresse hinterlegt."}</p>
                <p>
                  {[driver?.postal_code, driver?.city].filter(Boolean).join(" ")}
                </p>
                <p>{driver?.country || ""}</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">Straße & Hausnummer</label>
                  <Input
                    value={addressForm.address}
                    onChange={(event) =>
                      setAddressForm((prev) => ({ ...prev, address: event.target.value }))
                    }
                    placeholder="z.B. Musterstraße 12"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">PLZ</label>
                  <Input
                    value={addressForm.postal_code}
                    onChange={(event) =>
                      setAddressForm((prev) => ({ ...prev, postal_code: event.target.value }))
                    }
                    placeholder="z.B. 40210"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Stadt</label>
                  <Input
                    value={addressForm.city}
                    onChange={(event) =>
                      setAddressForm((prev) => ({ ...prev, city: event.target.value }))
                    }
                    placeholder="z.B. Düsseldorf"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">Land</label>
                  <Input
                    value={addressForm.country}
                    onChange={(event) =>
                      setAddressForm((prev) => ({ ...prev, country: event.target.value }))
                    }
                    placeholder="Deutschland"
                  />
                </div>
              </div>
            )}
            {addressError && <p className="text-sm text-red-600">{addressError}</p>}
            {addressConfirmed ? (
              <div className="text-sm text-emerald-700 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Adresse bestätigt
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  type="button"
                  onClick={handleConfirmAddress}
                  disabled={confirmingAddress || !addressForm.address.trim() || !allDocumentsUploaded}
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                >
                  {confirmingAddress ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Adresse bestätigen
                </Button>
                {!allDocumentsUploaded && (
                  <p className="text-xs text-slate-500">
                    Bitte zuerst alle Dokumente hochladen, dann bestätigen.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Image className="h-4 w-4 text-slate-400" />
              <span className="font-medium">Dokumente hochladen</span>
            </div>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <DocumentUploadField label="Führerschein Vorderseite" field="license_front" />
              <DocumentUploadField label="Führerschein Rückseite" field="license_back" />
              <DocumentUploadField label="Ausweis Vorderseite" field="id_card_front" />
              <DocumentUploadField label="Ausweis Rückseite" field="id_card_back" />
            </div>
            <p className="text-xs text-slate-500">
              Hinweis: Nach dem Upload können Dokumente nicht mehr entfernt werden. Nach der
              Bestätigung ist kein weiterer Upload möglich.
            </p>
          </div>
        </CardContent>
      </Card>

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
              <div className="mt-3">
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
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {t("profile.license.securityNote")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("billing.title")}</h2>
              <p className="text-sm text-slate-500">{t("billing.subtitle")}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div>
                <label className="text-xs text-slate-500">{t("billing.rangeStart")}</label>
                <Input
                  type="date"
                  value={billingRange.start}
                  onChange={(event) =>
                    setBillingRange((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t("billing.rangeEnd")}</label>
                <Input
                  type="date"
                  value={billingRange.end}
                  onChange={(event) =>
                    setBillingRange((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const today = new Date();
                const date = today.toISOString().slice(0, 10);
                setBillingRange({ start: date, end: date });
              }}
            >
              {t("billing.quick.today")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const day = new Date();
                day.setDate(day.getDate() - 1);
                const date = day.toISOString().slice(0, 10);
                setBillingRange({ start: date, end: date });
              }}
            >
              {t("billing.quick.yesterday")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const day = new Date();
                day.setDate(day.getDate() - 2);
                const date = day.toISOString().slice(0, 10);
                setBillingRange({ start: date, end: date });
              }}
            >
              {t("billing.quick.dayBefore")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 7);
                setBillingRange({
                  start: start.toISOString().slice(0, 10),
                  end: end.toISOString().slice(0, 10),
                });
              }}
            >
              {t("billing.quick.weekAgo")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t("billing.totalEarnings")}</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(billingTotals.price)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{t("billing.totalExpenses")}</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(billingTotals.expenses)}
              </p>
            </div>
          </div>

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
                      <td className="py-2 pr-4 text-slate-700">{row.tour || "-"}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.typeLabel}</td>
                      <td className="py-2 pr-4 text-sm">
                        <div className="flex flex-col gap-1">
                          <span>
                            {row.priceStatus === "approved"
                              ? "✅"
                              : row.priceStatus === "rejected"
                                ? "❌"
                                : "⏳"}{" "}
                            {t(`billing.status.${row.priceStatus}`)}
                          </span>
                          {row.priceStatus === "rejected" && row.priceRejectionReason ? (
                            <span className="text-xs text-red-600">
                              {row.priceRejectionReason}
                            </span>
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

    </div>
  );
}
