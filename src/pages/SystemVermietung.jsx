import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Loader2,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  CreditCard,
  Users,
  Zap,
  Calendar,
  Shield,
} from "lucide-react";
import { appClient } from "@/api/appClient";

const buildCompanyForm = (company, owner) => ({
  id: company?.id || "",
  name: company?.name || "",
  vat_id: company?.vat_id || "",
  billing_address: company?.billing_address || "",
  billing_city: company?.billing_city || "",
  billing_postal_code: company?.billing_postal_code || "",
  billing_country: company?.billing_country || "",
  contact_name: company?.contact_name || "",
  contact_email: company?.contact_email || "",
  contact_phone: company?.contact_phone || "",
  is_active: company?.is_active ?? true,
  account_type: company?.account_type || "paying",
  trial_expires_at: company?.trial_expires_at || "",
  owner_name: owner?.full_name || "",
  owner_email: owner?.email || "",
  owner_phone: owner?.phone || "",
  owner_active: owner?.is_active ?? true,
  owner_reset_pending: owner?.must_reset_password ?? false,
});

const getTrialDaysLeft = (expiresAt) => {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
  return diff;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-DE");
};

export default function SystemVermietung() {
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [emailSent, setEmailSent] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyForm, setCompanyForm] = useState(buildCompanyForm(null, null));
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyMessage, setCompanyMessage] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [upgradingCompany, setUpgradingCompany] = useState(false);

  useEffect(() => {
    const load = async () => {
      const user = await appClient.auth.getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const owner = await fetchCompanies();
        setIsOwner(owner);
      } catch {
        setIsOwner(false);
      } finally {
        setChecking(false);
      }
    };
    load();
  }, []);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const fetchCompanies = async (preferredId) => {
    const token = await getAuthToken();
    if (!token) return false;
    const response = await fetch("/api/admin/list-companies", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      setCompanyError(payload?.error || "Konnte Mandanten nicht laden.");
      return false;
    }
    const items = payload.data || [];
    setCompanies(items);
    if (items.length) {
      const resolvedId = preferredId || selectedCompanyId || items[0].id;
      const selected = items.find((item) => item.id === resolvedId) || items[0];
      const ownerProfile = selected.owner_profile || null;
      setSelectedCompanyId(selected.id);
      setSelectedCompany(selected);
      setCompanyForm(buildCompanyForm(selected, ownerProfile));
    } else {
      setSelectedCompanyId("");
      setSelectedCompany(null);
      setCompanyForm(buildCompanyForm(null, null));
    }
    return true;
  };

  const handleSelectCompany = (companyId) => {
    const company = companies.find((item) => item.id === companyId);
    if (!company) return;
    setSelectedCompanyId(companyId);
    setSelectedCompany(company);
    setCompanyForm(buildCompanyForm(company, company.owner_profile || null));
    setCompanyMessage("");
    setCompanyError("");
    setDeleteMessage("");
    setDeleteError("");
  };

  const handleCompanyChange = (field, value) => {
    setCompanyForm((prev) => ({ ...prev, [field]: value }));
  };

  // Stats
  const stats = useMemo(() => {
    const paying = companies.filter((c) => c.account_type !== "trial");
    const trial = companies.filter((c) => c.account_type === "trial");
    const trialActive = trial.filter((c) => {
      const days = getTrialDaysLeft(c.trial_expires_at);
      return days !== null && days > 0;
    });
    const trialExpired = trial.filter((c) => {
      const days = getTrialDaysLeft(c.trial_expires_at);
      return days !== null && days <= 0;
    });
    return {
      total: companies.length,
      paying: paying.length,
      trial: trial.length,
      trialActive: trialActive.length,
      trialExpired: trialExpired.length,
    };
  }, [companies]);

  // Filtered companies based on tab
  const filteredCompanies = useMemo(() => {
    if (activeTab === "paying") return companies.filter((c) => c.account_type !== "trial");
    if (activeTab === "trial") return companies.filter((c) => c.account_type === "trial");
    return companies;
  }, [companies, activeTab]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setTempPassword("");
    setLoginUrl("");
    setEmailSent(null);

    if (!companyName.trim() || !ownerEmail.trim() || !ownerName.trim()) {
      setError("Bitte Firmenname, Geschäftsführer und E-Mail ausfüllen.");
      return;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Nicht angemeldet.");
      const response = await fetch("/api/admin/create-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_full_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          owner_phone: ownerPhone.trim(),
          login_url: `${window.location.origin}/login/executive`,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Mandant konnte nicht erstellt werden.");
      }
      setMessage(`Mandant "${payload.data.company_name}" wurde angelegt.`);
      setTempPassword(payload.data.tempPassword || "");
      setLoginUrl(payload.data.loginUrl || "");
      setEmailSent(payload.data.emailSent ?? null);
      setCompanyName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPhone("");
      await fetchCompanies(selectedCompanyId);
    } catch (err) {
      setError(err?.message || "Mandant konnte nicht erstellt werden.");
    } finally {
      setSaving(false);
    }
  };

  const handleCompanySave = async () => {
    if (!companyForm.id) return;
    setCompanyError("");
    setCompanyMessage("");
    setSavingCompany(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Nicht angemeldet.");
      const response = await fetch("/api/admin/update-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id: companyForm.id,
          updates: {
            name: companyForm.name,
            vat_id: companyForm.vat_id,
            billing_address: companyForm.billing_address,
            billing_city: companyForm.billing_city,
            billing_postal_code: companyForm.billing_postal_code,
            billing_country: companyForm.billing_country,
            contact_name: companyForm.contact_name,
            contact_email: companyForm.contact_email,
            contact_phone: companyForm.contact_phone,
            is_active: companyForm.is_active,
          },
          owner_profile: {
            full_name: companyForm.owner_name,
            phone: companyForm.owner_phone,
            is_active: companyForm.owner_active,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Mandant konnte nicht aktualisiert werden.");
      }
      setCompanyMessage("Mandant gespeichert.");
      await fetchCompanies(selectedCompanyId);
    } catch (err) {
      setCompanyError(err?.message || "Mandant konnte nicht aktualisiert werden.");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUpgradeToPayng = async () => {
    if (!companyForm.id) return;
    setUpgradingCompany(true);
    setCompanyError("");
    setCompanyMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Nicht angemeldet.");
      const response = await fetch("/api/admin/update-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id: companyForm.id,
          updates: {
            account_type: "paying",
            trial_expires_at: null,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Upgrade fehlgeschlagen.");
      }
      setCompanyMessage("Mandant wurde auf 'Zahlend' umgestellt.");
      await fetchCompanies(selectedCompanyId);
    } catch (err) {
      setCompanyError(err?.message || "Upgrade fehlgeschlagen.");
    } finally {
      setUpgradingCompany(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!companyForm.id) return;
    setDeleteMessage("");
    setDeleteError("");
    const confirmed = window.confirm(
      `Mandant "${companyForm.name}" wirklich löschen? Alle Daten und Nutzer werden entfernt.`
    );
    if (!confirmed) return;
    setDeletingCompany(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Nicht angemeldet.");
      const response = await fetch("/api/admin/delete-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ company_id: companyForm.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Mandant konnte nicht gelöscht werden.");
      }
      setDeleteMessage("Mandant wurde gelöscht.");
      await fetchCompanies();
    } catch (err) {
      setDeleteError(err?.message || "Mandant konnte nicht gelöscht werden.");
    } finally {
      setDeletingCompany(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Lade Systemverwaltung...
      </div>
    );
  }

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-500">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <p className="font-semibold">Kein Zugriff</p>
          <p className="text-sm">Diese Seite ist nur für den Systembetreiber verfügbar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3">
          <Link to={createPageUrl("AdminControlling")}>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Zurück zu Admin Controlling
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">System‑Vermietung</h1>
        <p className="text-sm text-slate-500">
          Mandanten verwalten, Trial-Status überwachen und Upgrades durchführen.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setActiveTab("all")}>
          <CardContent className="p-4 text-center">
            <Building2 className="mx-auto mb-2 h-6 w-6 text-[#1e3a5f]" />
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-xs text-slate-500">Gesamt</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-300 transition-colors" onClick={() => setActiveTab("paying")}>
          <CardContent className="p-4 text-center">
            <CreditCard className="mx-auto mb-2 h-6 w-6 text-green-600" />
            <p className="text-2xl font-bold text-green-600">{stats.paying}</p>
            <p className="text-xs text-slate-500">Zahlende Kunden</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-cyan-300 transition-colors" onClick={() => setActiveTab("trial")}>
          <CardContent className="p-4 text-center">
            <Clock className="mx-auto mb-2 h-6 w-6 text-cyan-600" />
            <p className="text-2xl font-bold text-cyan-600">{stats.trialActive}</p>
            <p className="text-xs text-slate-500">Trial aktiv</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-300 transition-colors" onClick={() => setActiveTab("trial")}>
          <CardContent className="p-4 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
            <p className="text-2xl font-bold text-red-500">{stats.trialExpired}</p>
            <p className="text-xs text-slate-500">Trial abgelaufen</p>
          </CardContent>
        </Card>
      </div>

      {/* Neuer Mandant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1e3a5f]">
            <Building2 className="h-5 w-5" />
            Neuer Mandant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Firmenname *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <Label>Geschäftsführer *</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div>
                <Label>Geschäftsführer E‑Mail *</Label>
                <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}
            {message && (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {message}</div>
                {loginUrl && <div className="text-xs">Login‑URL: <div className="mt-1 break-all rounded bg-white/70 p-2">{loginUrl}</div></div>}
                {tempPassword && <div className="text-xs">Temporäres Passwort: <div className="mt-1 break-all rounded bg-white/70 p-2">{tempPassword}</div></div>}
                {emailSent === false && <div className="text-xs">E‑Mail konnte nicht gesendet werden. Bitte Zugangsdaten manuell weitergeben.</div>}
              </div>
            )}
            <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mandant anlegen
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Mandanten-Liste */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Mandanten</CardTitle>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {[
                { key: "all", label: "Alle", count: stats.total },
                { key: "paying", label: "Zahlend", count: stats.paying },
                { key: "trial", label: "Trial", count: stats.trial },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {companyError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {companyError}
            </div>
          )}
          {!filteredCompanies.length ? (
            <p className="text-sm text-slate-500">
              {activeTab === "paying" ? "Noch keine zahlenden Kunden." : activeTab === "trial" ? "Keine Trial-Kunden." : "Noch keine Mandanten angelegt."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
              {/* Company List */}
              <div className="space-y-2 max-h-[600px] overflow-auto">
                {filteredCompanies.map((company) => {
                  const isTrial = company.account_type === "trial";
                  const daysLeft = getTrialDaysLeft(company.trial_expires_at);
                  const isExpired = isTrial && daysLeft !== null && daysLeft <= 0;
                  const isUrgent = isTrial && daysLeft !== null && daysLeft > 0 && daysLeft <= 3;

                  return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => handleSelectCompany(company.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition-all ${
                        company.id === selectedCompanyId
                          ? "border-blue-300 bg-blue-50 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{company.name}</p>
                        {isTrial ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isExpired
                                ? "bg-red-100 text-red-700"
                                : isUrgent
                                ? "bg-amber-100 text-amber-700"
                                : "bg-cyan-100 text-cyan-700"
                            }`}
                          >
                            {isExpired ? "Abgelaufen" : `Trial · ${daysLeft}d`}
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Zahlend
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {company.profiles?.length ?? 0} Profile
                        </span>
                        {isTrial && daysLeft !== null && !isExpired && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            bis {formatDate(company.trial_expires_at)}
                          </span>
                        )}
                        <span>{company.is_active ? "Aktiv" : "Inaktiv"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Company Detail */}
              {companyForm.id && (
                <div className="space-y-4">
                  {/* Account-Typ Badge */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        {companyForm.account_type === "trial" ? (
                          <Clock className="h-4 w-4 text-cyan-600" />
                        ) : (
                          <CreditCard className="h-4 w-4 text-green-600" />
                        )}
                        <strong className="text-slate-900">
                          {companyForm.account_type === "trial" ? "Trial-Account" : "Zahlender Kunde"}
                        </strong>
                      </span>
                      {companyForm.account_type === "trial" && companyForm.trial_expires_at && (
                        <>
                          <span>
                            Ablauf: <strong className="text-slate-900">{formatDate(companyForm.trial_expires_at)}</strong>
                          </span>
                          <span>
                            Verbleibend:{" "}
                            <strong
                              className={
                                getTrialDaysLeft(companyForm.trial_expires_at) <= 0
                                  ? "text-red-600"
                                  : getTrialDaysLeft(companyForm.trial_expires_at) <= 3
                                  ? "text-amber-600"
                                  : "text-cyan-600"
                              }
                            >
                              {getTrialDaysLeft(companyForm.trial_expires_at)} Tage
                            </strong>
                          </span>
                        </>
                      )}
                      <span>
                        Mitarbeiter: <strong className="text-slate-900">{selectedCompany?.employee_count ?? 0}</strong>
                      </span>
                      <span>
                        Fahrer: <strong className="text-slate-900">{selectedCompany?.driver_count ?? 0}</strong>
                      </span>
                    </div>
                    {companyForm.account_type === "trial" && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={handleUpgradeToPayng}
                          disabled={upgradingCompany}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {upgradingCompany ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="mr-2 h-3.5 w-3.5" />
                          )}
                          Auf "Zahlend" upgraden
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Firmendaten */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>Firmenname</Label>
                      <Input value={companyForm.name} onChange={(e) => handleCompanyChange("name", e.target.value)} />
                    </div>
                    <div>
                      <Label>USt‑ID</Label>
                      <Input value={companyForm.vat_id} onChange={(e) => handleCompanyChange("vat_id", e.target.value)} />
                    </div>
                    <div>
                      <Label>Ansprechpartner</Label>
                      <Input value={companyForm.contact_name} onChange={(e) => handleCompanyChange("contact_name", e.target.value)} />
                    </div>
                    <div>
                      <Label>Kontakt E‑Mail</Label>
                      <Input type="email" value={companyForm.contact_email} onChange={(e) => handleCompanyChange("contact_email", e.target.value)} />
                    </div>
                    <div>
                      <Label>Kontakt Telefon</Label>
                      <Input value={companyForm.contact_phone} onChange={(e) => handleCompanyChange("contact_phone", e.target.value)} />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={companyForm.is_active} onChange={(e) => handleCompanyChange("is_active", e.target.checked)} />
                        {companyForm.is_active ? "Aktiv" : "Inaktiv"}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Rechnungsadresse</Label>
                      <Input value={companyForm.billing_address} onChange={(e) => handleCompanyChange("billing_address", e.target.value)} />
                    </div>
                    <div>
                      <Label>PLZ</Label>
                      <Input value={companyForm.billing_postal_code} onChange={(e) => handleCompanyChange("billing_postal_code", e.target.value)} />
                    </div>
                    <div>
                      <Label>Stadt</Label>
                      <Input value={companyForm.billing_city} onChange={(e) => handleCompanyChange("billing_city", e.target.value)} />
                    </div>
                    <div>
                      <Label>Land</Label>
                      <Input value={companyForm.billing_country} onChange={(e) => handleCompanyChange("billing_country", e.target.value)} />
                    </div>
                  </div>

                  {/* Geschäftsführer */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-semibold text-slate-700">Geschäftsführer‑Profil</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <Label>Name</Label>
                        <Input value={companyForm.owner_name} onChange={(e) => handleCompanyChange("owner_name", e.target.value)} />
                      </div>
                      <div>
                        <Label>E‑Mail</Label>
                        <Input value={companyForm.owner_email} disabled />
                      </div>
                      <div>
                        <Label>Telefon</Label>
                        <Input value={companyForm.owner_phone} onChange={(e) => handleCompanyChange("owner_phone", e.target.value)} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        Status: {companyForm.owner_active ? "Aktiv" : "Inaktiv"}
                        {companyForm.owner_reset_pending ? " • Passwort-Setup offen" : null}
                      </div>
                    </div>
                  </div>

                  {/* Profile */}
                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-700">Profile im Mandanten</p>
                      <span className="text-xs text-slate-400">{selectedCompany?.profiles?.length ?? 0} Einträge</span>
                    </div>
                    <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                      {(selectedCompany?.profiles || []).map((profile) => (
                        <div
                          key={profile.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">{profile.full_name || "Ohne Name"}</p>
                            <p className="text-xs text-slate-500">{profile.email}</p>
                          </div>
                          <div className="text-xs text-slate-500">
                            Rolle: {profile.role || "unbekannt"} • {profile.is_active ? "Aktiv" : "Inaktiv"}
                            {profile.must_reset_password ? " • Passwort offen" : ""}
                          </div>
                        </div>
                      ))}
                      {!selectedCompany?.profiles?.length && <p className="text-xs text-slate-400">Keine Profile vorhanden.</p>}
                    </div>
                  </div>

                  {companyMessage && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{companyMessage}</div>
                  )}
                  {deleteMessage && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{deleteMessage}</div>
                  )}
                  {deleteError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" onClick={handleCompanySave} disabled={savingCompany}>
                      {savingCompany ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Mandant speichern
                    </Button>
                    <Button type="button" variant="destructive" onClick={handleDeleteCompany} disabled={deletingCompany}>
                      {deletingCompany ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Mandant löschen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
