import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, CheckCircle2, AlertCircle } from "lucide-react";
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
  owner_name: owner?.full_name || "",
  owner_email: owner?.email || "",
  owner_phone: owner?.phone || "",
  owner_active: owner?.is_active ?? true,
  owner_reset_pending: owner?.must_reset_password ?? false,
});

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

  useEffect(() => {
    const load = async () => {
      const user = await appClient.auth.getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const token = await getAuthToken();
        if (!token) {
          setChecking(false);
          return;
        }
        const response = await fetch("/api/admin/check-owner", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json();
        const owner = Boolean(payload?.isOwner);
        setIsOwner(owner);
        if (owner) {
          await fetchCompanies();
        }
      } catch (err) {
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

  const fetchCompanies = async () => {
    const token = await getAuthToken();
    if (!token) return;
    const response = await fetch("/api/admin/list-companies", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      setCompanyError(payload?.error || "Konnte Mandanten nicht laden.");
      return;
    }
    const items = payload.data || [];
    setCompanies(items);
    if (items.length) {
      const first = items[0];
      const ownerProfile = first.owner_profile || null;
      setSelectedCompanyId(first.id);
      setCompanyForm(buildCompanyForm(first, ownerProfile));
    }
  };

  const handleSelectCompany = (companyId) => {
    const company = companies.find((item) => item.id === companyId);
    if (!company) return;
    setSelectedCompanyId(companyId);
    setCompanyForm(buildCompanyForm(company, company.owner_profile || null));
    setCompanyMessage("");
    setCompanyError("");
  };

  const handleCompanyChange = (field, value) => {
    setCompanyForm((prev) => ({ ...prev, [field]: value }));
  };

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
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
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
      await fetchCompanies();
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
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
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
      await fetchCompanies();
    } catch (err) {
      setCompanyError(err?.message || "Mandant konnte nicht aktualisiert werden.");
    } finally {
      setSavingCompany(false);
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
        <h1 className="text-2xl font-bold text-slate-900">System‑Vermietung</h1>
        <p className="text-sm text-slate-500">
          Lege neue Mandanten an und erstelle den Geschäftsführer‑Zugang.
        </p>
      </div>

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
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {message && (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {message}
                </div>
                {loginUrl && (
                  <div className="text-xs text-emerald-700">
                    Login‑URL:
                    <div className="mt-1 break-all rounded bg-white/70 p-2">{loginUrl}</div>
                  </div>
                )}
                {tempPassword && (
                  <div className="text-xs text-emerald-700">
                    Temporäres Passwort:
                    <div className="mt-1 break-all rounded bg-white/70 p-2">{tempPassword}</div>
                  </div>
                )}
                {emailSent === false && (
                  <div className="text-xs text-emerald-700">
                    E‑Mail konnte nicht gesendet werden. Bitte Zugangsdaten manuell weitergeben.
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mandant anlegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktive Mandanten</CardTitle>
        </CardHeader>
        <CardContent>
          {companyError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {companyError}
            </div>
          )}
          {!companies.length ? (
            <p className="text-sm text-slate-500">Noch keine Mandanten angelegt.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
              <div className="space-y-2">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handleSelectCompany(company.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                      company.id === selectedCompanyId
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{company.name}</p>
                    <p className="text-xs text-slate-500">
                      Status: {company.is_active ? "Aktiv" : "Inaktiv"}
                    </p>
                  </button>
                ))}
              </div>

              {companyForm.id && (
                <div className="space-y-4">
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
                      <Input
                        value={companyForm.contact_name}
                        onChange={(e) => handleCompanyChange("contact_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Kontakt E‑Mail</Label>
                      <Input
                        type="email"
                        value={companyForm.contact_email}
                        onChange={(e) => handleCompanyChange("contact_email", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Kontakt Telefon</Label>
                      <Input
                        value={companyForm.contact_phone}
                        onChange={(e) => handleCompanyChange("contact_phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={companyForm.is_active}
                          onChange={(e) => handleCompanyChange("is_active", e.target.checked)}
                        />
                        {companyForm.is_active ? "Aktiv" : "Inaktiv"}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Rechnungsadresse</Label>
                      <Input
                        value={companyForm.billing_address}
                        onChange={(e) => handleCompanyChange("billing_address", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>PLZ</Label>
                      <Input
                        value={companyForm.billing_postal_code}
                        onChange={(e) => handleCompanyChange("billing_postal_code", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Stadt</Label>
                      <Input
                        value={companyForm.billing_city}
                        onChange={(e) => handleCompanyChange("billing_city", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Land</Label>
                      <Input
                        value={companyForm.billing_country}
                        onChange={(e) => handleCompanyChange("billing_country", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-semibold text-slate-700">Geschäftsführer‑Profil</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={companyForm.owner_name}
                          onChange={(e) => handleCompanyChange("owner_name", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>E‑Mail</Label>
                        <Input value={companyForm.owner_email} disabled />
                      </div>
                      <div>
                        <Label>Telefon</Label>
                        <Input
                          value={companyForm.owner_phone}
                          onChange={(e) => handleCompanyChange("owner_phone", e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        Status: {companyForm.owner_active ? "Aktiv" : "Inaktiv"}
                        {companyForm.owner_reset_pending ? " • Passwort-Setup offen" : null}
                      </div>
                    </div>
                  </div>

                  {companyMessage && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {companyMessage}
                    </div>
                  )}

                  <Button
                    type="button"
                    className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                    onClick={handleCompanySave}
                    disabled={savingCompany}
                  >
                    {savingCompany ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Mandant speichern
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
