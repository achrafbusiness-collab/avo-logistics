import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { appClient } from "@/api/appClient";
import {
  ArrowLeft, Loader2, Building2, CheckCircle2, AlertCircle,
  Save, FileText, Send, Download, Image, CreditCard, Receipt,
} from "lucide-react";

const formatCurrency = (v) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);

const formatDate = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "–");

const getMonthLabel = (monthStr) => {
  if (!monthStr) return "–";
  const [y, m] = monthStr.split("-");
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
};

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function SystemBilling() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "invoices");
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  // Billing Profile
  const [profile, setProfile] = useState({
    company_name: "", company_suffix: "", owner_name: "", legal_form: "",
    street: "", postal_code: "", city: "", country: "Deutschland",
    phone: "", fax: "", email: "", website: "",
    tax_number: "", vat_id: "", bank_name: "", iban: "", bic: "",
    invoice_prefix: "TF-SYS", next_invoice_number: 1000,
    default_vat_rate: 19, default_payment_days: 14,
    payment_terms: "Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.",
    logo_data_url: "",
  });
  const [profileId, setProfileId] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const logoInputRef = useRef(null);

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [genError, setGenError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const user = await appClient.auth.getCurrentUser();
      if (!user) { setLoading(false); return; }
      setIsOwner(true);

      // Load billing profile
      const { data: profiles } = await supabase
        .from("system_billing_profile")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      if (profiles?.length) {
        setProfile((prev) => ({ ...prev, ...profiles[0] }));
        setProfileId(profiles[0].id);
      }

      // Load invoices
      const { data: invData } = await supabase
        .from("system_invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setInvoices(invData || []);

      // Load companies
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (token) {
        const res = await fetch("/api/admin/list-companies", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (payload?.ok) setCompanies(payload.data || []);
      }
    } catch {
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError("");
    setProfileSaved(false);
    try {
      const payload = { ...profile };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      payload.updated_at = new Date().toISOString();
      payload.next_invoice_number = parseInt(payload.next_invoice_number, 10) || 1000;
      payload.default_vat_rate = parseFloat(payload.default_vat_rate) || 19;
      payload.default_payment_days = parseInt(payload.default_payment_days, 10) || 14;

      if (profileId) {
        await supabase.from("system_billing_profile").update(payload).eq("id", profileId);
      } else {
        const { data } = await supabase.from("system_billing_profile").insert(payload).select().single();
        if (data) setProfileId(data.id);
      }
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { setProfileError("Logo max. 500 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => setProfile((prev) => ({ ...prev, logo_data_url: reader.result }));
    reader.readAsDataURL(file);
  };

  const payingCompanies = useMemo(
    () => companies.filter((c) => c.account_type !== "trial" && c.is_active),
    [companies]
  );

  const handleGenerateInvoices = async () => {
    if (!selectedMonth || !payingCompanies.length) return;
    setGenerating(true);
    setGenError("");
    setGenMessage("");

    try {
      const existing = invoices.filter((inv) => inv.billing_month === selectedMonth);
      const existingCompanyIds = new Set(existing.map((inv) => inv.company_id));

      let nextNum = parseInt(profile.next_invoice_number, 10) || 1000;
      const prefix = profile.invoice_prefix || "TF-SYS";
      const vatRate = parseFloat(profile.default_vat_rate) || 19;
      let created = 0;
      let skipped = 0;

      for (const company of payingCompanies) {
        if (existingCompanyIds.has(company.id)) {
          skipped++;
          continue;
        }

        const driverCount = company.driver_count || 0;
        const pricePerDriver = company.price_per_driver ?? 30;
        const netAmount = driverCount * pricePerDriver;
        const vatAmount = Math.round(netAmount * vatRate) / 100;
        const grossAmount = netAmount + vatAmount;
        const invoiceNumber = `${prefix}-${String(nextNum).padStart(5, "0")}`;

        await supabase.from("system_invoices").insert({
          invoice_number: invoiceNumber,
          company_id: company.id,
          company_name: company.name,
          billing_month: selectedMonth,
          driver_count: driverCount,
          price_per_driver: pricePerDriver,
          net_amount: netAmount,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          gross_amount: grossAmount,
          status: "draft",
        });

        nextNum++;
        created++;
      }

      // Update next invoice number
      if (profileId && created > 0) {
        await supabase.from("system_billing_profile").update({ next_invoice_number: nextNum }).eq("id", profileId);
        setProfile((prev) => ({ ...prev, next_invoice_number: nextNum }));
      }

      setGenMessage(`${created} Rechnungen erstellt${skipped ? `, ${skipped} übersprungen (bereits vorhanden)` : ""}.`);
      await loadAll();
    } catch (err) {
      setGenError(err?.message || "Fehler bei der Rechnungserstellung.");
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (invoiceId) => {
    await supabase.from("system_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
    await loadAll();
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm("Rechnung wirklich löschen?")) return;
    await supabase.from("system_invoices").delete().eq("id", invoiceId);
    await loadAll();
  };

  const monthlyInvoices = useMemo(() => {
    const grouped = {};
    for (const inv of invoices) {
      const key = inv.billing_month || "unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(inv);
    }
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [invoices]);

  const totalOpen = useMemo(
    () => invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.gross_amount || 0), 0),
    [invoices]
  );
  const totalPaid = useMemo(
    () => invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.gross_amount || 0), 0),
    [invoices]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Lade...
      </div>
    );
  }

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-500">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <p className="font-semibold">Kein Zugriff</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3">
          <Link to={createPageUrl("SystemVermietung")}>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Zurück zur Vermietung
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">System‑Rechnungen</h1>
        <p className="text-sm text-slate-500">Rechnungen an Mandanten erstellen und verwalten.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Receipt className="mx-auto mb-1 h-5 w-5 text-[#1e3a5f]" />
            <p className="text-2xl font-bold">{invoices.length}</p>
            <p className="text-xs text-slate-500">Rechnungen gesamt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="mx-auto mb-1 h-5 w-5 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalOpen)}</p>
            <p className="text-xs text-slate-500">Offen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-500" />
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-slate-500">Bezahlt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="mx-auto mb-1 h-5 w-5 text-slate-500" />
            <p className="text-2xl font-bold">{payingCompanies.length}</p>
            <p className="text-xs text-slate-500">Zahlende Mandanten</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {[
          { key: "invoices", label: "Rechnungen", icon: FileText },
          { key: "profile", label: "Mein Rechnungsprofil", icon: Building2 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* === RECHNUNGEN === */}
      {activeTab === "invoices" && (
        <div className="space-y-6">
          {/* Generator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-[#1e3a5f]" />
                Monatsrechnungen erstellen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!profile.company_name && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Bitte zuerst dein Rechnungsprofil ausfüllen (Tab "Mein Rechnungsprofil").
                </div>
              )}
              <div className="flex items-end gap-3">
                <div>
                  <Label>Abrechnungsmonat</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-48"
                  />
                </div>
                <Button
                  onClick={handleGenerateInvoices}
                  disabled={generating || !payingCompanies.length || !profile.company_name}
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                >
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
                  Rechnungen erstellen ({payingCompanies.length} Mandanten)
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Erstellt für jeden zahlenden Mandanten eine Rechnung: Anzahl Fahrer × Preis/Fahrer + MwSt.
              </p>
              {genMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {genMessage}
                </div>
              )}
              {genError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {genError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice List */}
          {monthlyInvoices.map(([month, invs]) => (
            <Card key={month}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{getMonthLabel(month)}</CardTitle>
                  <span className="text-xs text-slate-500">{invs.length} Rechnungen · {formatCurrency(invs.reduce((s, i) => s + (i.gross_amount || 0), 0))}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invs.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{inv.invoice_number}</p>
                          <p className="text-xs text-slate-500">{inv.company_name}</p>
                        </div>
                        <div className="text-xs text-slate-500">
                          {inv.driver_count} Fahrer × {formatCurrency(inv.price_per_driver)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(inv.gross_amount)}</p>
                          <p className="text-[10px] text-slate-400">Netto: {formatCurrency(inv.net_amount)}</p>
                        </div>
                        {inv.status === "paid" ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">Bezahlt</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">Offen</span>
                        )}
                        <div className="flex gap-1">
                          {inv.status !== "paid" && (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleMarkPaid(inv.id)}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Bezahlt
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500" onClick={() => handleDeleteInvoice(inv.id)}>
                            ×
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {!invoices.length && (
            <Card>
              <CardContent className="py-10 text-center text-slate-400">
                <FileText className="mx-auto mb-3 h-8 w-8" />
                <p>Noch keine Rechnungen erstellt.</p>
                <p className="text-xs mt-1">Wähle einen Monat und klicke "Rechnungen erstellen".</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* === RECHNUNGSPROFIL === */}
      {activeTab === "profile" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#1e3a5f]" />
              Mein Rechnungsprofil
            </CardTitle>
            <p className="text-sm text-slate-500">Diese Daten erscheinen auf deinen Rechnungen an Mandanten. Felder mit * sind Pflicht.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo */}
            <div className="flex items-center gap-4">
              {profile.logo_data_url ? (
                <img src={profile.logo_data_url} alt="Logo" className="h-14 max-w-[180px] object-contain rounded border p-1" />
              ) : (
                <div className="h-14 w-28 rounded border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">Kein Logo</div>
              )}
              <div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Image className="w-4 h-4 mr-1.5" />
                  {profile.logo_data_url ? "Logo ändern" : "Logo hochladen"}
                </Button>
                {profile.logo_data_url && (
                  <Button variant="ghost" size="sm" className="ml-2 text-red-500" onClick={() => handleProfileChange("logo_data_url", "")}>
                    Entfernen
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <h3 className="font-semibold text-slate-700">Unternehmen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Firmenname *</Label><Input value={profile.company_name} onChange={(e) => handleProfileChange("company_name", e.target.value)} /></div>
              <div><Label>Firmenzusatz</Label><Input value={profile.company_suffix} onChange={(e) => handleProfileChange("company_suffix", e.target.value)} placeholder="z.B. GmbH" /></div>
              <div><Label>Inhaber / GF *</Label><Input value={profile.owner_name} onChange={(e) => handleProfileChange("owner_name", e.target.value)} /></div>
              <div><Label>Rechtsform</Label><Input value={profile.legal_form} onChange={(e) => handleProfileChange("legal_form", e.target.value)} /></div>
              <div><Label>Straße *</Label><Input value={profile.street} onChange={(e) => handleProfileChange("street", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>PLZ *</Label><Input value={profile.postal_code} onChange={(e) => handleProfileChange("postal_code", e.target.value)} /></div>
                <div><Label>Stadt *</Label><Input value={profile.city} onChange={(e) => handleProfileChange("city", e.target.value)} /></div>
              </div>
              <div><Label>Land</Label><Input value={profile.country} onChange={(e) => handleProfileChange("country", e.target.value)} /></div>
              <div><Label>Telefon</Label><Input value={profile.phone} onChange={(e) => handleProfileChange("phone", e.target.value)} /></div>
              <div><Label>E-Mail *</Label><Input type="email" value={profile.email} onChange={(e) => handleProfileChange("email", e.target.value)} /></div>
              <div><Label>Website</Label><Input value={profile.website} onChange={(e) => handleProfileChange("website", e.target.value)} /></div>
            </div>

            <Separator />

            <h3 className="font-semibold text-slate-700">Steuer & Bank</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Steuernummer *</Label><Input value={profile.tax_number} onChange={(e) => handleProfileChange("tax_number", e.target.value)} /></div>
              <div><Label>USt-IdNr.</Label><Input value={profile.vat_id} onChange={(e) => handleProfileChange("vat_id", e.target.value)} placeholder="DE..." /></div>
              <div><Label>Bank *</Label><Input value={profile.bank_name} onChange={(e) => handleProfileChange("bank_name", e.target.value)} /></div>
              <div><Label>IBAN *</Label><Input value={profile.iban} onChange={(e) => handleProfileChange("iban", e.target.value)} placeholder="DE..." /></div>
              <div><Label>BIC</Label><Input value={profile.bic} onChange={(e) => handleProfileChange("bic", e.target.value)} /></div>
            </div>

            <Separator />

            <h3 className="font-semibold text-slate-700">Rechnungseinstellungen</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div><Label>Rechnungspräfix</Label><Input value={profile.invoice_prefix} onChange={(e) => handleProfileChange("invoice_prefix", e.target.value)} /></div>
              <div><Label>Nächste RE-Nr.</Label><Input type="number" value={profile.next_invoice_number} onChange={(e) => handleProfileChange("next_invoice_number", e.target.value)} /></div>
              <div><Label>MwSt. (%)</Label><Input type="number" value={profile.default_vat_rate} onChange={(e) => handleProfileChange("default_vat_rate", e.target.value)} /></div>
              <div><Label>Zahlungsziel (Tage)</Label><Input type="number" value={profile.default_payment_days} onChange={(e) => handleProfileChange("default_payment_days", e.target.value)} /></div>
            </div>
            <div>
              <Label>Zahlungsbedingungen</Label>
              <Textarea value={profile.payment_terms} onChange={(e) => handleProfileChange("payment_terms", e.target.value)} rows={2} />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                {profileSaved && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> Gespeichert</span>}
                {profileError && <span className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4" /> {profileError}</span>}
              </div>
              <Button onClick={handleSaveProfile} disabled={savingProfile} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                {savingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Rechnungsprofil speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
