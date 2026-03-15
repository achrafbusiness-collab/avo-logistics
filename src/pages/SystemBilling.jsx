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
  BarChart3, RefreshCw, Minus,
} from "lucide-react";
import { jsPDF } from "jspdf";

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
  const [sendingEmail, setSendingEmail] = useState({});
  const [creditDialogInvoice, setCreditDialogInvoice] = useState(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creatingCredit, setCreatingCredit] = useState(false);

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

        const driverLimit = company.driver_limit || company.driver_count || 0;
        const pricePerDriver = company.price_per_driver ?? 30;
        const netAmount = driverLimit * pricePerDriver;
        const vatAmount = Math.round(netAmount * vatRate) / 100;
        const grossAmount = netAmount + vatAmount;
        const invoiceNumber = `${prefix}-${String(nextNum).padStart(5, "0")}`;

        await supabase.from("system_invoices").insert({
          invoice_number: invoiceNumber,
          company_id: company.id,
          company_name: company.name,
          billing_month: selectedMonth,
          driver_count: driverLimit,
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

  // --- PDF Generation ---
  const generateInvoicePdf = (inv) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const isCredit = inv.invoice_type === "credit_note";
    const title = isCredit ? "GUTSCHRIFT" : "RECHNUNG";

    // Logo
    if (profile.logo_data_url) {
      try { doc.addImage(profile.logo_data_url, "PNG", 15, 12, 40, 16); } catch {}
    }

    // Sender
    doc.setFontSize(8);
    doc.setTextColor(120);
    const senderLine = [profile.company_name, profile.company_suffix, profile.street, `${profile.postal_code} ${profile.city}`].filter(Boolean).join(" · ");
    doc.text(senderLine, 15, 45);

    // Recipient
    const company = companies.find((c) => c.id === inv.company_id);
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(inv.company_name || "Kunde", 15, 55);
    if (company?.billing_address) doc.text(company.billing_address, 15, 61);
    if (company?.billing_postal_code || company?.billing_city)
      doc.text(`${company.billing_postal_code || ""} ${company.billing_city || ""}`.trim(), 15, 67);

    // Title + Meta
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 95);
    doc.text(title, w - 15, 55, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Nr.: ${inv.invoice_number}`, w - 15, 63, { align: "right" });
    doc.text(`Datum: ${formatDate(inv.created_at)}`, w - 15, 69, { align: "right" });
    doc.text(`Zeitraum: ${getMonthLabel(inv.billing_month)}`, w - 15, 75, { align: "right" });
    if (isCredit && inv.related_invoice_id) {
      const related = invoices.find((i) => i.id === inv.related_invoice_id);
      if (related) doc.text(`Zu Rechnung: ${related.invoice_number}`, w - 15, 81, { align: "right" });
    }

    // Table header
    let y = 95;
    doc.setFillColor(245, 247, 250);
    doc.rect(15, y - 5, w - 30, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Position", 17, y);
    doc.text("Menge", 100, y, { align: "right" });
    doc.text("Einzelpreis", 130, y, { align: "right" });
    doc.text("Betrag", w - 17, y, { align: "right" });

    // Position
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(30);
    const posLabel = isCredit
      ? `Gutschrift – ${inv.company_name}`
      : `TransferFleet Pro – ${getMonthLabel(inv.billing_month)}`;
    doc.text(posLabel, 17, y);
    doc.text(String(inv.driver_count || 0), 100, y, { align: "right" });
    doc.text(formatCurrency(inv.price_per_driver), 130, y, { align: "right" });
    const sign = isCredit ? "-" : "";
    doc.text(`${sign}${formatCurrency(inv.net_amount)}`, w - 17, y, { align: "right" });

    if (!isCredit) {
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`${inv.driver_count} Fahrer-Slots × ${formatCurrency(inv.price_per_driver)} / Monat`, 17, y);
    }

    // Totals
    y += 15;
    doc.setDrawColor(220);
    doc.line(100, y, w - 15, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text("Netto", 100, y);
    doc.text(`${sign}${formatCurrency(inv.net_amount)}`, w - 17, y, { align: "right" });
    y += 6;
    doc.text(`MwSt. ${inv.vat_rate}%`, 100, y);
    doc.text(`${sign}${formatCurrency(inv.vat_amount)}`, w - 17, y, { align: "right" });
    y += 2;
    doc.line(100, y, w - 15, y);
    y += 7;
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.setFont(undefined, "bold");
    doc.text("Gesamt", 100, y);
    doc.text(`${sign}${formatCurrency(inv.gross_amount)}`, w - 17, y, { align: "right" });
    doc.setFont(undefined, "normal");

    // Payment terms
    y += 15;
    doc.setFontSize(8);
    doc.setTextColor(100);
    const terms = (profile.payment_terms || "Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.")
      .replace("{days}", String(profile.default_payment_days || 14));
    doc.text(terms, 15, y);

    // Footer
    const footerY = 275;
    doc.setDrawColor(200);
    doc.line(15, footerY, w - 15, footerY);
    doc.setFontSize(7);
    doc.setTextColor(140);
    const col1 = [profile.company_name, profile.street, `${profile.postal_code} ${profile.city}`].filter(Boolean);
    const col2 = [profile.tax_number ? `St-Nr: ${profile.tax_number}` : "", profile.vat_id ? `USt-ID: ${profile.vat_id}` : "", profile.owner_name ? `GF: ${profile.owner_name}` : ""].filter(Boolean);
    const col3 = [profile.bank_name, profile.iban ? `IBAN: ${profile.iban}` : "", profile.bic ? `BIC: ${profile.bic}` : ""].filter(Boolean);
    col1.forEach((t, i) => doc.text(t, 15, footerY + 4 + i * 3.5));
    col2.forEach((t, i) => doc.text(t, 80, footerY + 4 + i * 3.5));
    col3.forEach((t, i) => doc.text(t, 145, footerY + 4 + i * 3.5));

    return doc;
  };

  const handleDownloadPdf = (inv) => {
    const doc = generateInvoicePdf(inv);
    doc.save(`${inv.invoice_number}.pdf`);
  };

  // --- Email senden ---
  const handleSendEmail = async (inv) => {
    const company = companies.find((c) => c.id === inv.company_id);
    const email = company?.contact_email || company?.owner_profile?.email;
    if (!email) {
      alert("Keine E-Mail-Adresse für diesen Mandanten hinterlegt.");
      return;
    }
    if (!window.confirm(`Rechnung ${inv.invoice_number} an ${email} senden?`)) return;
    setSendingEmail((prev) => ({ ...prev, [inv.id]: true }));
    try {
      const doc = generateInvoicePdf(inv);
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch("/api/admin/send-driver-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sendInvoiceEmail: true,
          recipientEmail: email,
          subject: `Rechnung ${inv.invoice_number} – TransferFleet`,
          body: `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie Ihre Rechnung ${inv.invoice_number} für den Zeitraum ${getMonthLabel(inv.billing_month)}.\n\nBetrag: ${formatCurrency(inv.gross_amount)} (inkl. MwSt.)\n\nMit freundlichen Grüßen\n${profile.company_name || "TransferFleet"}`,
          pdfBase64,
          pdfFilename: `${inv.invoice_number}.pdf`,
        }),
      });
      await supabase.from("system_invoices").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
      await loadAll();
      alert(`Rechnung an ${email} gesendet.`);
    } catch (err) {
      alert(err?.message || "E-Mail konnte nicht gesendet werden.");
    } finally {
      setSendingEmail((prev) => ({ ...prev, [inv.id]: false }));
    }
  };

  // --- Zahlungserinnerung ---
  const handleSendReminder = async (inv) => {
    const company = companies.find((c) => c.id === inv.company_id);
    const email = company?.contact_email || company?.owner_profile?.email;
    if (!email) { alert("Keine E-Mail-Adresse hinterlegt."); return; }
    if (!window.confirm(`Zahlungserinnerung für ${inv.invoice_number} an ${email} senden?`)) return;
    setSendingEmail((prev) => ({ ...prev, [`rem-${inv.id}`]: true }));
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch("/api/admin/send-driver-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sendInvoiceEmail: true,
          recipientEmail: email,
          subject: `Zahlungserinnerung – ${inv.invoice_number}`,
          body: `Sehr geehrte Damen und Herren,\n\nwir erlauben uns, Sie an die offene Rechnung ${inv.invoice_number} vom ${formatDate(inv.created_at)} zu erinnern.\n\nOffener Betrag: ${formatCurrency(inv.gross_amount)}\n\nBitte überweisen Sie den Betrag innerhalb der nächsten 7 Tage.\n\nMit freundlichen Grüßen\n${profile.company_name || "TransferFleet"}`,
        }),
      });
      await supabase.from("system_invoices").update({
        reminder_sent_at: new Date().toISOString(),
        reminder_count: (inv.reminder_count || 0) + 1,
      }).eq("id", inv.id);
      await loadAll();
      alert(`Zahlungserinnerung an ${email} gesendet.`);
    } catch (err) {
      alert(err?.message || "Erinnerung konnte nicht gesendet werden.");
    } finally {
      setSendingEmail((prev) => ({ ...prev, [`rem-${inv.id}`]: false }));
    }
  };

  // --- Gutschrift erstellen ---
  const handleCreateCredit = async () => {
    if (!creditDialogInvoice || !creditAmount) return;
    setCreatingCredit(true);
    try {
      const amount = parseFloat(creditAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ungültiger Betrag.");
      const vatRate = creditDialogInvoice.vat_rate || 19;
      const vatAmount = Math.round(amount * vatRate) / 100;
      const grossAmount = amount + vatAmount;

      let nextNum = parseInt(profile.next_invoice_number, 10) || 1000;
      const prefix = profile.invoice_prefix || "TF-SYS";
      const invoiceNumber = `${prefix}-GS-${String(nextNum).padStart(5, "0")}`;

      await supabase.from("system_invoices").insert({
        invoice_number: invoiceNumber,
        company_id: creditDialogInvoice.company_id,
        company_name: creditDialogInvoice.company_name,
        billing_month: creditDialogInvoice.billing_month,
        driver_count: creditDialogInvoice.driver_count,
        price_per_driver: creditDialogInvoice.price_per_driver,
        net_amount: amount,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        gross_amount: grossAmount,
        status: "credit",
        invoice_type: "credit_note",
        related_invoice_id: creditDialogInvoice.id,
        notes: creditNote || "",
      });

      if (profileId) {
        await supabase.from("system_billing_profile").update({ next_invoice_number: nextNum + 1 }).eq("id", profileId);
        setProfile((prev) => ({ ...prev, next_invoice_number: nextNum + 1 }));
      }

      setCreditDialogInvoice(null);
      setCreditAmount("");
      setCreditNote("");
      await loadAll();
    } catch (err) {
      alert(err?.message || "Gutschrift konnte nicht erstellt werden.");
    } finally {
      setCreatingCredit(false);
    }
  };

  // --- Jahresübersicht ---
  const yearlyData = useMemo(() => {
    const year = new Date().getFullYear();
    const months = [];
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      const monthInvs = invoices.filter((i) => i.billing_month === key && i.invoice_type !== "credit_note");
      const credits = invoices.filter((i) => i.billing_month === key && i.invoice_type === "credit_note");
      const revenue = monthInvs.reduce((s, i) => s + (i.gross_amount || 0), 0);
      const creditTotal = credits.reduce((s, i) => s + (i.gross_amount || 0), 0);
      const paid = monthInvs.filter((i) => i.status === "paid").reduce((s, i) => s + (i.gross_amount || 0), 0);
      const label = new Date(year, m).toLocaleDateString("de-DE", { month: "short" });
      months.push({ key, label, revenue, creditTotal, paid, net: revenue - creditTotal });
    }
    return months;
  }, [invoices]);

  const maxYearlyRevenue = useMemo(() => Math.max(...yearlyData.map((m) => m.revenue), 1), [yearlyData]);
  const yearlyTotal = useMemo(() => yearlyData.reduce((s, m) => s + m.net, 0), [yearlyData]);
  const yearlyPaid = useMemo(() => yearlyData.reduce((s, m) => s + m.paid, 0), [yearlyData]);

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
          { key: "yearly", label: "Jahresübersicht", icon: BarChart3 },
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
                          {inv.driver_count} Slots × {formatCurrency(inv.price_per_driver)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(inv.gross_amount)}</p>
                          <p className="text-[10px] text-slate-400">Netto: {formatCurrency(inv.net_amount)}</p>
                        </div>
                        {inv.invoice_type === "credit_note" ? (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700">Gutschrift</span>
                        ) : inv.status === "paid" ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">Bezahlt</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            Offen{inv.reminder_count > 0 ? ` (${inv.reminder_count}× erinnert)` : ""}
                          </span>
                        )}
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleDownloadPdf(inv)} title="PDF herunterladen">
                            <Download className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleSendEmail(inv)} disabled={sendingEmail[inv.id]} title="Per E-Mail senden">
                            {sendingEmail[inv.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          </Button>
                          {inv.status !== "paid" && inv.invoice_type !== "credit_note" && (
                            <>
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleMarkPaid(inv.id)}>
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Bezahlt
                              </Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 text-amber-600" onClick={() => handleSendReminder(inv)} disabled={sendingEmail[`rem-${inv.id}`]} title="Zahlungserinnerung">
                                {sendingEmail[`rem-${inv.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              </Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 text-purple-600" onClick={() => { setCreditDialogInvoice(inv); setCreditAmount(String(inv.net_amount || 0)); }} title="Gutschrift erstellen">
                                <Minus className="w-3 h-3" />
                              </Button>
                            </>
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

      {/* === GUTSCHRIFT DIALOG === */}
      {creditDialogInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">Gutschrift erstellen</CardTitle>
              <p className="text-sm text-slate-500">Zu Rechnung {creditDialogInvoice.invoice_number} ({creditDialogInvoice.company_name})</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Netto-Betrag (EUR) *</Label>
                <Input type="number" step="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">Original: {formatCurrency(creditDialogInvoice.net_amount)}</p>
              </div>
              <div>
                <Label>Grund</Label>
                <Textarea value={creditNote} onChange={(e) => setCreditNote(e.target.value)} rows={2} placeholder="z.B. Fahrer im Monat inaktiv" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setCreditDialogInvoice(null)}>Abbrechen</Button>
                <Button onClick={handleCreateCredit} disabled={creatingCredit} className="bg-purple-600 hover:bg-purple-700 text-white">
                  {creatingCredit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Minus className="w-4 h-4 mr-2" />}
                  Gutschrift erstellen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* === JAHRESÜBERSICHT === */}
      {activeTab === "yearly" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#1e3a5f]" />
                  Einnahmen {new Date().getFullYear()}
                </CardTitle>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#1e3a5f]">{formatCurrency(yearlyTotal)}</p>
                  <p className="text-xs text-slate-500">Gesamt (netto nach Gutschriften)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-48 mb-4">
                {yearlyData.map((month) => (
                  <div key={month.key} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-medium">
                      {month.revenue > 0 ? formatCurrency(month.revenue) : ""}
                    </span>
                    <div className="w-full flex flex-col gap-0.5" style={{ height: `${Math.max((month.revenue / maxYearlyRevenue) * 100, 2)}%` }}>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-green-600 to-green-400 flex-1"
                        style={{ height: month.revenue > 0 ? `${(month.paid / month.revenue) * 100}%` : "0%" }}
                        title={`Bezahlt: ${formatCurrency(month.paid)}`}
                      />
                      <div
                        className="w-full bg-amber-400 flex-1"
                        style={{ height: month.revenue > 0 ? `${((month.revenue - month.paid) / month.revenue) * 100}%` : "100%" }}
                        title={`Offen: ${formatCurrency(month.revenue - month.paid)}`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{month.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500" /> Bezahlt</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400" /> Offen</span>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monatsdetails</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {yearlyData.filter((m) => m.revenue > 0 || m.creditTotal > 0).reverse().map((month) => (
                  <div key={month.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5">
                    <span className="font-medium text-sm text-slate-800">{getMonthLabel(month.key)}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-500">Brutto: {formatCurrency(month.revenue)}</span>
                      {month.creditTotal > 0 && <span className="text-purple-600">Gutschriften: -{formatCurrency(month.creditTotal)}</span>}
                      <span className="text-green-600">Bezahlt: {formatCurrency(month.paid)}</span>
                      <span className="text-amber-600">Offen: {formatCurrency(month.revenue - month.paid)}</span>
                    </div>
                  </div>
                ))}
                {!yearlyData.some((m) => m.revenue > 0) && (
                  <p className="text-sm text-slate-400 text-center py-4">Noch keine Einnahmen in diesem Jahr.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Year Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-slate-500">Brutto gesamt</p><p className="text-xl font-bold text-[#1e3a5f]">{formatCurrency(yearlyData.reduce((s, m) => s + m.revenue, 0))}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-slate-500">Gutschriften</p><p className="text-xl font-bold text-purple-600">-{formatCurrency(yearlyData.reduce((s, m) => s + m.creditTotal, 0))}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-slate-500">Bezahlt</p><p className="text-xl font-bold text-green-600">{formatCurrency(yearlyPaid)}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-slate-500">Offen</p><p className="text-xl font-bold text-amber-600">{formatCurrency(yearlyTotal - yearlyPaid)}</p></CardContent></Card>
          </div>
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
