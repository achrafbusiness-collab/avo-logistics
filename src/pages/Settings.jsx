import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { getFinanceSettings, saveFinanceSettings } from '@/utils/invoiceStorage';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Building2, Save, Loader2, CheckCircle2, Server, Phone,
  FileText, AlertCircle, CreditCard, Image,
} from 'lucide-react';

const TABS = [
  { key: 'company', label: 'Firma', icon: Building2 },
  { key: 'billing', label: 'Rechnungsprofil', icon: CreditCard },
  { key: 'imap', label: 'E-Mail Import (IMAP)', icon: Server },
  { key: 'legal', label: 'Rechtstexte', icon: FileText },
];

const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function Settings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'company');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const logoInputRef = useRef(null);

  // App settings from Supabase
  const { data: appSettingsList = [], isLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });

  // --- Company & Support ---
  const [company, setCompany] = useState({
    company_name: 'TransferFleet',
    support_phone: '',
    support_email: '',
    emergency_phone: '',
    office_address: '',
    office_hours: 'Mo-Fr: 08:00 - 18:00 Uhr',
    app_version: '1.0.0',
    instructions: '',
  });

  // --- SMTP ---
  const [smtp, setSmtp] = useState({
    email_sender_name: '',
    email_sender_address: '',
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_pass: '',
    smtp_secure: true,
  });

  // --- IMAP ---
  const [imap, setImap] = useState({
    imap_host: '',
    imap_port: '',
    imap_user: '',
    imap_pass: '',
    imap_secure: true,
  });

  // --- Legal ---
  const [legal, setLegal] = useState({
    legal_text: 'Der Kunde und der Fahrer bestätigen, dass das Fahrzeug in dem oben dokumentierten Zustand übernommen wurde.',
    delivery_legal_text: 'Das Fahrzeug wurde in diesem Zustand ordnungsgemäß übergeben und entgegengenommen.',
  });

  // --- Billing / Invoice Profile ---
  const [billing, setBilling] = useState(() => {
    const fs = getFinanceSettings();
    return {
      invoicePrefix: fs.invoicePrefix || 'TF',
      defaultVatRate: fs.defaultVatRate ?? 19,
      defaultPaymentDays: fs.defaultPaymentDays ?? 14,
      nextInvoiceNumber: fs.nextInvoiceNumber ?? 1000,
      ...(fs.invoiceProfile || {}),
    };
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // --- SMTP Test ---
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  // --- IMAP Test ---
  const [imapTesting, setImapTesting] = useState(false);
  const [imapMessage, setImapMessage] = useState('');

  // Load from Supabase
  useEffect(() => {
    if (appSettingsList.length > 0) {
      const s = appSettingsList[0];
      setCompany((prev) => ({
        ...prev,
        company_name: s.company_name || prev.company_name,
        support_phone: s.support_phone || '',
        support_email: s.support_email || '',
        emergency_phone: s.emergency_phone || '',
        office_address: s.office_address || '',
        office_hours: s.office_hours || prev.office_hours,
        app_version: s.app_version || prev.app_version,
        instructions: s.instructions || '',
      }));
      setSmtp((prev) => ({
        ...prev,
        email_sender_name: s.email_sender_name || '',
        email_sender_address: s.email_sender_address || '',
        smtp_host: s.smtp_host || '',
        smtp_port: s.smtp_port != null ? String(s.smtp_port) : '',
        smtp_user: s.smtp_user || '',
        smtp_pass: s.smtp_pass || '',
        smtp_secure: s.smtp_secure ?? true,
      }));
      setImap((prev) => ({
        ...prev,
        imap_host: s.imap_host || '',
        imap_port: s.imap_port != null ? String(s.imap_port) : '',
        imap_user: s.imap_user || '',
        imap_pass: s.imap_pass || '',
        imap_secure: s.imap_secure ?? true,
      }));
      setLegal((prev) => ({
        ...prev,
        legal_text: s.legal_text || prev.legal_text,
        delivery_legal_text: s.delivery_legal_text || prev.delivery_legal_text,
      }));
    }
  }, [appSettingsList]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setSaved(false);
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload = {
        ...company,
        ...smtp,
        smtp_port: toIntOrNull(smtp.smtp_port),
        smtp_secure: Boolean(smtp.smtp_secure),
        ...imap,
        imap_port: toIntOrNull(imap.imap_port),
        imap_secure: Boolean(imap.imap_secure),
        ...legal,
      };

      if (appSettingsList.length > 0) {
        await appClient.entities.AppSettings.update(appSettingsList[0].id, payload);
      } else {
        await appClient.entities.AppSettings.create(payload);
      }

      // Save billing to localStorage (used by invoice generation)
      const currentFs = getFinanceSettings();
      saveFinanceSettings({
        ...currentFs,
        invoicePrefix: billing.invoicePrefix,
        defaultVatRate: Number(billing.defaultVatRate) || 19,
        defaultPaymentDays: Number(billing.defaultPaymentDays) || 14,
        nextInvoiceNumber: Number(billing.nextInvoiceNumber) || 1000,
        invoiceProfile: {
          ...(currentFs.invoiceProfile || {}),
          companyName: billing.companyName || '',
          companySuffix: billing.companySuffix || '',
          owner: billing.owner || '',
          legalForm: billing.legalForm || '',
          street: billing.street || '',
          postalCode: billing.postalCode || '',
          city: billing.city || '',
          country: billing.country || '',
          phone: billing.phone || '',
          fax: billing.fax || '',
          email: billing.email || '',
          website: billing.website || '',
          taxNumber: billing.taxNumber || '',
          vatId: billing.vatId || '',
          bankName: billing.bankName || '',
          accountNumber: billing.accountNumber || '',
          blz: billing.blz || '',
          iban: billing.iban || '',
          bic: billing.bic || '',
          defaultContactPerson: billing.defaultContactPerson || '',
          paymentTerms: billing.paymentTerms || '',
          logoDataUrl: billing.logoDataUrl || '',
        },
      });

      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const handleSmtpPortChange = (value) => {
    const parsed = Number(value);
    setSmtp((prev) => ({
      ...prev,
      smtp_port: value,
      ...(parsed === 465 ? { smtp_secure: true } : {}),
      ...(parsed === 587 ? { smtp_secure: false } : {}),
    }));
  };

  const handleTestEmail = async () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestMessage('');
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      const res = await fetch('/api/admin/send-driver-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ testEmail: true, recipientEmail: testEmail.trim() }),
      });
      const data = await res.json();
      setTestMessage(data?.ok ? 'Test-E-Mail wurde gesendet.' : data?.error || 'Fehler beim Senden.');
    } catch (err) {
      setTestMessage(err?.message || 'Fehler beim Senden.');
    } finally {
      setTestSending(false);
    }
  };

  const handleImapTest = async () => {
    setImapTesting(true);
    setImapMessage('');
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      const res = await fetch('/api/admin/email-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          testConnection: true,
          host: imap.imap_host,
          port: toIntOrNull(imap.imap_port) || (imap.imap_secure ? 993 : 143),
          user: imap.imap_user,
          pass: imap.imap_pass,
          secure: Boolean(imap.imap_secure),
        }),
      });
      const data = await res.json();
      setImapMessage(data?.ok ? 'IMAP-Verbindung erfolgreich!' : data?.error || 'Verbindung fehlgeschlagen.');
    } catch (err) {
      setImapMessage(err?.message || 'Verbindung fehlgeschlagen.');
    } finally {
      setImapTesting(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setError('Logo darf max. 500 KB groß sein.');
      return;
    }
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setBilling((prev) => ({ ...prev, logoDataUrl: reader.result }));
      setLogoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Lade Einstellungen...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-sm text-slate-500">Konfigurieren Sie Ihr Unternehmen, Rechnungsprofil, E-Mail-Versand und mehr.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-md px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.key === 'company' ? 'Firma' : tab.key === 'billing' ? 'Rechnung' : tab.key === 'imap' ? 'IMAP' : 'Recht'}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-6">

          {/* === FIRMA === */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#1e3a5f]" /> Unternehmensdaten
                </h2>
                <p className="text-sm text-slate-500 mt-1">Diese Daten erscheinen in der App, auf Protokollen und in E-Mails.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Firmenname *</Label>
                  <Input value={company.company_name} onChange={(e) => setCompany((p) => ({ ...p, company_name: e.target.value }))} />
                </div>
                <div>
                  <Label>App-Version</Label>
                  <Input value={company.app_version} onChange={(e) => setCompany((p) => ({ ...p, app_version: e.target.value }))} />
                </div>
              </div>
              <Separator />
              <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Phone className="w-4 h-4" /> Support & Kontakt</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Support Telefon</Label>
                  <Input value={company.support_phone} onChange={(e) => setCompany((p) => ({ ...p, support_phone: e.target.value }))} placeholder="+49 ..." />
                </div>
                <div>
                  <Label>Support E-Mail</Label>
                  <Input type="email" value={company.support_email} onChange={(e) => setCompany((p) => ({ ...p, support_email: e.target.value }))} />
                </div>
                <div>
                  <Label>Notfall-Hotline</Label>
                  <Input value={company.emergency_phone} onChange={(e) => setCompany((p) => ({ ...p, emergency_phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Bürozeiten</Label>
                  <Input value={company.office_hours} onChange={(e) => setCompany((p) => ({ ...p, office_hours: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Büroadresse</Label>
                  <Textarea value={company.office_address} onChange={(e) => setCompany((p) => ({ ...p, office_address: e.target.value }))} rows={2} placeholder="Straße, PLZ Stadt" />
                </div>
              </div>
              <Separator />
              <div>
                <Label>Anweisungen für Fahrer</Label>
                <Textarea value={company.instructions} onChange={(e) => setCompany((p) => ({ ...p, instructions: e.target.value }))} rows={3} placeholder="Allgemeine Hinweise..." />
              </div>
            </div>
          )}

          {/* === RECHNUNGSPROFIL === */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#1e3a5f]" /> Rechnungsprofil
                </h2>
                <p className="text-sm text-slate-500 mt-1">Diese Daten erscheinen auf Ihren Rechnungen. Felder mit * sind Pflicht.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? 'Vorschau schließen' : 'Rechnungsvorschau anzeigen'}
              </Button>

              {showPreview && (
                <div className="rounded-lg border-2 border-slate-200 bg-white p-4 sm:p-6 text-sm space-y-4 shadow-inner">
                  <div className="flex flex-col sm:flex-row items-start gap-3 sm:justify-between">
                    <div>
                      {billing.logoDataUrl && <img src={billing.logoDataUrl} alt="Logo" className="h-10 mb-2" />}
                      <p className="font-bold text-base">{billing.companyName || 'Firmenname'}{billing.companySuffix ? ` ${billing.companySuffix}` : ''}</p>
                      <p className="text-slate-500 text-xs">{billing.street || 'Straße'}</p>
                      <p className="text-slate-500 text-xs">{billing.postalCode || 'PLZ'} {billing.city || 'Stadt'}</p>
                      {billing.phone && <p className="text-slate-500 text-xs">Tel: {billing.phone}</p>}
                      {billing.email && <p className="text-slate-500 text-xs">{billing.email}</p>}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-bold text-lg text-[#1e3a5f]">RECHNUNG</p>
                      <p className="text-xs text-slate-400">Nr. {billing.invoicePrefix || 'TF'}-{billing.nextInvoiceNumber || '1000'}</p>
                      <p className="text-xs text-slate-400">Datum: {new Date().toLocaleDateString('de-DE')}</p>
                      <p className="text-xs text-slate-400">MwSt: {billing.defaultVatRate || 19}%</p>
                    </div>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-2 font-medium">
                      <span>Position</span><span>Betrag</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                      <span>Fahrzeugüberführung B-XX 1234 (Berlin → München)</span><span>150,00 €</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                      <span>Fahrzeugüberführung M-YY 5678 (München → Hamburg)</span><span>220,00 €</span>
                    </div>
                    <div className="flex justify-between text-xs pt-2 font-medium">
                      <span>Netto</span><span>370,00 €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>MwSt. {billing.defaultVatRate || 19}%</span><span>{(370 * (billing.defaultVatRate || 19) / 100).toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1 border-t mt-1">
                      <span>Gesamt</span><span>{(370 * (1 + (billing.defaultVatRate || 19) / 100)).toFixed(2)} €</span>
                    </div>
                  </div>
                  <div className="border-t pt-3 text-[10px] text-slate-400 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                    <div>
                      {billing.taxNumber && <p>St-Nr: {billing.taxNumber}</p>}
                      {billing.vatId && <p>USt-ID: {billing.vatId}</p>}
                      {billing.owner && <p>GF: {billing.owner}</p>}
                    </div>
                    <div>
                      {billing.bankName && <p>{billing.bankName}</p>}
                      {billing.iban && <p>IBAN: {billing.iban}</p>}
                      {billing.bic && <p>BIC: {billing.bic}</p>}
                    </div>
                    <div>
                      {billing.website && <p>{billing.website}</p>}
                      <p>Zahlungsziel: {billing.defaultPaymentDays || 14} Tage</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Logo */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                {billing.logoDataUrl ? (
                  <img src={billing.logoDataUrl} alt="Logo" className="h-16 max-w-[200px] object-contain rounded border p-1" />
                ) : (
                  <div className="h-16 w-32 rounded border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">Kein Logo</div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                    <Image className="w-4 h-4 mr-1.5" />
                    {logoUploading ? 'Lädt...' : billing.logoDataUrl ? 'Logo ändern' : 'Logo hochladen'}
                  </Button>
                  {billing.logoDataUrl && (
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setBilling((p) => ({ ...p, logoDataUrl: '' }))}>
                      Entfernen
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Firmenname (Rechnung) *</Label>
                  <Input value={billing.companyName || ''} onChange={(e) => setBilling((p) => ({ ...p, companyName: e.target.value }))} />
                </div>
                <div>
                  <Label>Firmenzusatz</Label>
                  <Input value={billing.companySuffix || ''} onChange={(e) => setBilling((p) => ({ ...p, companySuffix: e.target.value }))} placeholder="z.B. GmbH" />
                </div>
                <div>
                  <Label>Inhaber / Geschäftsführer</Label>
                  <Input value={billing.owner || ''} onChange={(e) => setBilling((p) => ({ ...p, owner: e.target.value }))} />
                </div>
                <div>
                  <Label>Rechtsform</Label>
                  <Input value={billing.legalForm || ''} onChange={(e) => setBilling((p) => ({ ...p, legalForm: e.target.value }))} placeholder="z.B. Einzelunternehmen" />
                </div>
                <div>
                  <Label>Straße *</Label>
                  <Input value={billing.street || ''} onChange={(e) => setBilling((p) => ({ ...p, street: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>PLZ *</Label>
                    <Input value={billing.postalCode || ''} onChange={(e) => setBilling((p) => ({ ...p, postalCode: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Stadt *</Label>
                    <Input value={billing.city || ''} onChange={(e) => setBilling((p) => ({ ...p, city: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Land</Label>
                  <Input value={billing.country || ''} onChange={(e) => setBilling((p) => ({ ...p, country: e.target.value }))} placeholder="Deutschland" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={billing.phone || ''} onChange={(e) => setBilling((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input type="email" value={billing.email || ''} onChange={(e) => setBilling((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={billing.website || ''} onChange={(e) => setBilling((p) => ({ ...p, website: e.target.value }))} />
                </div>
              </div>

              <Separator />
              <h3 className="font-semibold text-slate-700">Steuer & Bank</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Steuernummer *</Label>
                  <Input value={billing.taxNumber || ''} onChange={(e) => setBilling((p) => ({ ...p, taxNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>USt-IdNr.</Label>
                  <Input value={billing.vatId || ''} onChange={(e) => setBilling((p) => ({ ...p, vatId: e.target.value }))} placeholder="DE..." />
                </div>
                <div>
                  <Label>Bank</Label>
                  <Input value={billing.bankName || ''} onChange={(e) => setBilling((p) => ({ ...p, bankName: e.target.value }))} />
                </div>
                <div>
                  <Label>IBAN *</Label>
                  <Input value={billing.iban || ''} onChange={(e) => setBilling((p) => ({ ...p, iban: e.target.value }))} placeholder="DE..." />
                </div>
                <div>
                  <Label>BIC</Label>
                  <Input value={billing.bic || ''} onChange={(e) => setBilling((p) => ({ ...p, bic: e.target.value }))} />
                </div>
                <div>
                  <Label>Ansprechperson (Standard)</Label>
                  <Input value={billing.defaultContactPerson || ''} onChange={(e) => setBilling((p) => ({ ...p, defaultContactPerson: e.target.value }))} />
                </div>
              </div>

              <Separator />
              <h3 className="font-semibold text-slate-700">Rechnungseinstellungen</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <Label>Rechnungspräfix</Label>
                  <Input value={billing.invoicePrefix || ''} onChange={(e) => setBilling((p) => ({ ...p, invoicePrefix: e.target.value }))} placeholder="TF" />
                </div>
                <div>
                  <Label>MwSt. (%)</Label>
                  <Input type="number" value={billing.defaultVatRate ?? ''} onChange={(e) => setBilling((p) => ({ ...p, defaultVatRate: e.target.value }))} />
                </div>
                <div>
                  <Label>Zahlungsziel (Tage)</Label>
                  <Input type="number" value={billing.defaultPaymentDays ?? ''} onChange={(e) => setBilling((p) => ({ ...p, defaultPaymentDays: e.target.value }))} />
                </div>
                <div>
                  <Label>Nächste RE-Nr.</Label>
                  <Input type="number" value={billing.nextInvoiceNumber ?? ''} onChange={(e) => setBilling((p) => ({ ...p, nextInvoiceNumber: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Zahlungsbedingungen</Label>
                <Textarea value={billing.paymentTerms || ''} onChange={(e) => setBilling((p) => ({ ...p, paymentTerms: e.target.value }))} rows={2} placeholder="Zahlung innerhalb von {days} Tagen..." />
              </div>
            </div>
          )}

          {/* === IMAP === */}
          {activeTab === 'imap' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Server className="w-5 h-5 text-[#1e3a5f]" /> E-Mail Import (IMAP)
                </h2>
                <p className="text-sm text-slate-500 mt-1">Wird für den automatischen AI-Import von Aufträgen aus E-Mails verwendet.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>IMAP Host</Label>
                  <Input value={imap.imap_host} onChange={(e) => setImap((p) => ({ ...p, imap_host: e.target.value }))} placeholder="imap.ionos.de" />
                </div>
                <div>
                  <Label>IMAP Port</Label>
                  <Input type="number" value={imap.imap_port} onChange={(e) => setImap((p) => ({ ...p, imap_port: e.target.value }))} placeholder="993" />
                </div>
                <div>
                  <Label>IMAP Benutzer</Label>
                  <Input value={imap.imap_user} onChange={(e) => setImap((p) => ({ ...p, imap_user: e.target.value }))} />
                </div>
                <div>
                  <Label>IMAP Passwort</Label>
                  <Input type="password" value={imap.imap_pass} onChange={(e) => setImap((p) => ({ ...p, imap_pass: e.target.value }))} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={imap.imap_secure} onCheckedChange={(v) => setImap((p) => ({ ...p, imap_secure: v }))} />
                  <Label>TLS/SSL aktiv</Label>
                </div>
              </div>
              <Button variant="outline" onClick={handleImapTest} disabled={imapTesting || !imap.imap_host || !imap.imap_user}>
                {imapTesting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Server className="w-4 h-4 mr-1.5" />}
                Verbindung testen
              </Button>
              {imapMessage && <p className={`text-sm ${imapMessage.includes('erfolgreich') ? 'text-green-600' : 'text-red-600'}`}>{imapMessage}</p>}
            </div>
          )}

          {/* === RECHTSTEXTE === */}
          {activeTab === 'legal' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#1e3a5f]" /> Rechtstexte & Bestätigungen
                </h2>
                <p className="text-sm text-slate-500 mt-1">Diese Texte erscheinen auf den Fahrzeugprotokollen der Fahrer.</p>
              </div>
              <div>
                <Label>Bestätigungstext Abholung</Label>
                <Textarea value={legal.legal_text} onChange={(e) => setLegal((p) => ({ ...p, legal_text: e.target.value }))} rows={4} />
              </div>
              <div>
                <Label>Bestätigungstext Abgabe</Label>
                <Textarea value={legal.delivery_legal_text} onChange={(e) => setLegal((p) => ({ ...p, delivery_legal_text: e.target.value }))} rows={4} />
              </div>
            </div>
          )}

          {/* Save Bar */}
          <Separator />
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" /> Gespeichert
                </span>
              )}
              {error && (
                <span className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" /> {error}
                </span>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a] w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Alle Einstellungen speichern
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
