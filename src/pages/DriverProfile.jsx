import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, User, Building2, Copy } from "lucide-react";
import { useI18n } from "@/i18n";

export default function DriverProfile() {
  const { t } = useI18n();
  const [user, setUser] = useState(null);
  const [licenseToken, setLicenseToken] = useState(null);
  const [tokenError, setTokenError] = useState("");
  const [loadingToken, setLoadingToken] = useState(false);

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
    </div>
  );
}
