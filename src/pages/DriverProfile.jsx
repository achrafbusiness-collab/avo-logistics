import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, User, Building2, Copy } from "lucide-react";
import { useI18n } from "@/i18n";

export default function DriverProfile() {
  const { t, formatDate, formatNumber } = useI18n();
  const [user, setUser] = useState(null);
  const [licenseToken, setLicenseToken] = useState(null);
  const [tokenError, setTokenError] = useState("");
  const [loadingToken, setLoadingToken] = useState(false);
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
  const driver = drivers.find((item) => item.email === user?.email);

  const { data: driverOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["driver-orders", driver?.id],
    queryFn: () =>
      appClient.entities.Order.filter({ assigned_driver_id: driver?.id }, "-created_date"),
    enabled: !!driver?.id,
  });

  const { data: driverSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ["driver-segments", driver?.id],
    queryFn: () => appClient.entities.OrderSegment.filter({ driver_id: driver?.id }, "-created_date", 200),
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
        return {
          id: segment.id,
          date,
          dateLabel: date ? formatDate(date) : "-",
          licensePlate: ordersById.get(segment.order_id)?.license_plate || "-",
          tour: `${segment.start_location || ""} → ${segment.end_location || ""}`.trim(),
          price: Number.isFinite(Number(segment.price)) ? Number(segment.price) : 0,
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
  }, [billingRange, driverSegments, expensesByOrder, formatDate, ordersById]);

  const billingTotals = React.useMemo(() => {
    return billingRows.reduce(
      (acc, row) => {
        acc.price += row.price;
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
                      <td className="py-2 pr-4 text-right">{formatCurrency(row.price)}</td>
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
