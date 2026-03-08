import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StatusBadge from '@/components/ui/StatusBadge';
import { buildEmptyPriceRow, normalizePriceList } from '@/utils/priceList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/lib/supabaseClient';
import {
  deleteInvoice,
  deleteInvoiceDraft,
  getFinanceSettings,
  listInvoiceDrafts,
  listInvoices,
  saveFinanceSettings,
  updateInvoiceStatus,
} from '@/utils/invoiceStorage';
import { buildCustomerInvoicePdf } from '@/utils/customerInvoicePdf';
import { 
  Plus, 
  Search, 
  Building2,
  UserCircle,
  ArrowLeft,
  Loader2,
  Save,
  X,
  Edit,
  Trash2,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';

export default function Customers() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'customers');
  const [priceListText, setPriceListText] = useState('');
  const [priceListRows, setPriceListRows] = useState([]);
  const [priceListError, setPriceListError] = useState('');
  const [priceListMessage, setPriceListMessage] = useState('');
  const [priceListAnalyzing, setPriceListAnalyzing] = useState(false);
  const [priceListSaving, setPriceListSaving] = useState(false);
  const [financeRefreshTick, setFinanceRefreshTick] = useState(0);
  const [financeSearch, setFinanceSearch] = useState('');
  const [financeSettings, setFinanceSettings] = useState(() => getFinanceSettings());
  const [logoUploading, setLogoUploading] = useState(false);
  const [invoiceEmailDialogOpen, setInvoiceEmailDialogOpen] = useState(false);
  const [invoiceEmailTarget, setInvoiceEmailTarget] = useState('');
  const [invoiceEmailFeedback, setInvoiceEmailFeedback] = useState({ type: '', message: '' });
  const [invoiceEmailSending, setInvoiceEmailSending] = useState(false);
  const [selectedInvoiceForEmail, setSelectedInvoiceForEmail] = useState(null);
  
  const [formData, setFormData] = useState({
    customer_number: '',
    type: 'business',
    company_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'Deutschland',
    tax_id: '',
    notes: '',
    status: 'active',
    price_list: [],
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list('-created_date', 500),
  });

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });
  const appSettings = appSettingsList[0] || null;

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Customer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Customer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Customer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setView('list');
      setSelectedCustomer(null);
      setDeleteConfirmOpen(false);
    },
  });

  useEffect(() => {
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedCustomer(null);
      // Generate customer number
      const number = Math.floor(10000 + Math.random() * 90000);
      setFormData(prev => ({ ...prev, customer_number: `K-${number}` }));
    } else if (urlParams.get('id')) {
      const customer = customers.find(c => c.id === urlParams.get('id'));
      if (customer) {
        setSelectedCustomer(customer);
        setView('details');
      }
    }
  }, [urlParams.toString(), customers]);

  useEffect(() => {
    const refreshFinance = () => {
      setFinanceRefreshTick((prev) => prev + 1);
      setFinanceSettings(getFinanceSettings());
    };
    window.addEventListener('focus', refreshFinance);
    document.addEventListener('visibilitychange', refreshFinance);
    return () => {
      window.removeEventListener('focus', refreshFinance);
      document.removeEventListener('visibilitychange', refreshFinance);
    };
  }, []);

  useEffect(() => {
    if (selectedCustomer && view === 'form') {
      setFormData({
        ...selectedCustomer,
        price_list: selectedCustomer.price_list || [],
      });
    } else if (view === 'form' && !selectedCustomer) {
      const number = Math.floor(10000 + Math.random() * 90000);
      setFormData({
        customer_number: `K-${number}`,
        type: 'business',
        company_name: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',
        country: 'Deutschland',
        tax_id: '',
        notes: '',
        status: 'active',
        price_list: [],
      });
    }
  }, [selectedCustomer, view]);

  useEffect(() => {
    if (!selectedCustomer || view !== 'details') return;
    setPriceListRows(selectedCustomer.price_list || []);
    setPriceListText('');
    setPriceListError('');
    setPriceListMessage('');
  }, [selectedCustomer, view]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
      };

      let savedCustomer = null;
      if (selectedCustomer) {
        savedCustomer = await updateMutation.mutateAsync({
          id: selectedCustomer.id,
          data: dataToSave,
        });
      } else {
        savedCustomer = await createMutation.mutateAsync(dataToSave);
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (savedCustomer) {
        setSelectedCustomer(savedCustomer);
      }
      setView('details');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const getCustomerName = (customer) => {
    if (customer.type === 'business' && customer.company_name) {
      return customer.company_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unbekannt';
  };

  const handlePriceRowChange = (index, field, value) => {
    setPriceListRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handlePriceRowRemove = (index) => {
    setPriceListRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handlePriceListAnalyze = async () => {
    if (!priceListText.trim()) {
      setPriceListError('Bitte Preisliste eingeben.');
      return;
    }
    setPriceListAnalyzing(true);
    setPriceListError('');
    setPriceListMessage('');
    try {
      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Analysiere die folgende Preisliste (Deutsch) und gib eine Struktur zurück.
Gib IMMER ein Objekt mit dem Feld "tiers" zurück.

Text:
${priceListText}

Regeln:
- min_km (Zahl) und max_km (Zahl) in Kilometern.
- max_km kann null sein, wenn "ab" oder "über" angegeben ist.
- price ist der Festpreis in EUR.

Gib ausschließlich strukturierte Daten zurück.`,
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            tiers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  min_km: { type: ["number", "string"] },
                  max_km: { type: ["number", "string", "null"] },
                  price: { type: ["number", "string"] },
                },
                required: ["min_km", "price"],
              },
            },
          },
          required: ["tiers"],
        },
      });

      const tiers = Array.isArray(result?.tiers) ? result.tiers : [];
      setPriceListRows(tiers);
      setPriceListMessage('Preisliste wurde analysiert. Bitte prüfen und speichern.');
    } catch (err) {
      setPriceListError(err?.message || 'Preisliste konnte nicht analysiert werden.');
    } finally {
      setPriceListAnalyzing(false);
    }
  };

  const handlePriceListSave = async () => {
    if (!selectedCustomer) return;
    setPriceListSaving(true);
    setPriceListError('');
    setPriceListMessage('');
    try {
      const normalized = normalizePriceList(priceListRows);
      await updateMutation.mutateAsync({
        id: selectedCustomer.id,
        data: {
          price_list: normalized,
        },
      });
      const updatedCustomer = {
        ...selectedCustomer,
        price_list: normalized,
      };
      setSelectedCustomer(updatedCustomer);
      setPriceListRows(normalized);
      setPriceListMessage('Preisliste gespeichert.');
    } catch (err) {
      setPriceListError(err?.message || 'Preisliste konnte nicht gespeichert werden.');
    } finally {
      setPriceListSaving(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const name = getCustomerName(customer);
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           customer.customer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           customer.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return format(date, 'dd.MM.yyyy HH:mm', { locale: de });
  };

  const resolveInvoiceCustomerEmail = (invoice) => {
    const fromInvoice = String(invoice?.customer?.email || '').trim();
    if (fromInvoice) return fromInvoice;
    const customerId = invoice?.customer?.id || (invoice?.customerKey !== '__none__' ? invoice?.customerKey : '');
    if (!customerId) return '';
    const customer = customers.find((entry) => entry.id === customerId);
    return String(customer?.email || '').trim();
  };

  const getInvoiceCustomerName = (invoice) => {
    const customer = invoice?.customer || null;
    if (customer?.type === 'business' && customer?.company_name) return customer.company_name;
    const fullName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ').trim();
    return fullName || invoice?.customerLabel || 'Kunde';
  };

  const resolveInvoiceIssuer = () => {
    const profile = financeSettings.invoiceProfile || {};
    const officeAddress = String(appSettings?.office_address || '').trim();
    const [officeStreetRaw = '', officeCityRaw = '', officeCountryRaw = ''] = officeAddress
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean);
    const cityMatch = officeCityRaw.match(/^(\d{4,5})\s+(.+)$/);
    const defaults = {
      name: 'AVO LOGISTICS',
      street: 'Collenbachstraße 1',
      postalCode: '40476',
      city: 'Düsseldorf',
      country: 'Deutschland',
      phone: '+49 17624273014',
      email: 'info@avo-logistics.de',
      web: 'www.avo-logistics.de',
      taxNumber: '10350222746',
      vatId: 'DE361070222',
      bankName: 'Stadtsparkasse Düsseldorf',
      iban: 'DE98 3005 0110 1009 0619 02',
      bic: 'DUSSDEDDXXX',
      owner: 'Achraf Bolakhrif',
    };
    return {
      name: profile.companyName || appSettings?.company_name || defaults.name,
      companySuffix: profile.companySuffix || '',
      legalForm: profile.legalForm || '',
      street: profile.street || officeStreetRaw || defaults.street,
      postalCode: profile.postalCode || cityMatch?.[1] || defaults.postalCode,
      city: profile.city || cityMatch?.[2] || officeCityRaw || defaults.city,
      country: profile.country || officeCountryRaw || defaults.country,
      phone: profile.phone || appSettings?.support_phone || defaults.phone,
      fax: profile.fax || '',
      email: profile.email || appSettings?.support_email || defaults.email,
      web: profile.website || defaults.web,
      taxNumber: profile.taxNumber || defaults.taxNumber,
      vatId: profile.vatId || defaults.vatId,
      bankName: profile.bankName || defaults.bankName,
      accountNumber: profile.accountNumber || '',
      blz: profile.blz || '',
      iban: profile.iban || defaults.iban,
      bic: profile.bic || defaults.bic,
      owner: profile.owner || defaults.owner,
      paymentTerms:
        profile.paymentTerms || 'Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.',
      logoDataUrl: profile.logoDataUrl || '',
    };
  };

  const buildInvoicePdfForEmail = async (invoice) => {
    const rows = Array.isArray(invoice?.rows) ? invoice.rows : [];
    const meta = invoice?.invoiceMeta || {};
    const customerId = invoice?.customer?.id || (invoice?.customerKey !== '__none__' ? invoice?.customerKey : '');
    const latestCustomer = customerId ? customers.find((entry) => entry.id === customerId) : null;
    const mergedCustomer = {
      ...(invoice?.customer || {}),
      ...(latestCustomer || {}),
    };
    const finalMeta = {
      ...meta,
      invoiceNumber: meta.invoiceNumber || '-',
      invoiceDate: meta.invoiceDate || format(new Date(), 'yyyy-MM-dd'),
      deliveryDate: meta.deliveryDate || meta.invoiceDate || format(new Date(), 'yyyy-MM-dd'),
      customerNumber: meta.customerNumber || mergedCustomer?.customer_number || '',
      contactPerson: meta.contactPerson || financeSettings?.invoiceProfile?.defaultContactPerson || '',
      paymentDays: String(meta.paymentDays || financeSettings.defaultPaymentDays || 14),
      vatRate: String(meta.vatRate ?? financeSettings.defaultVatRate ?? 19),
      includeFuel: meta.includeFuel !== false,
    };
    return buildCustomerInvoicePdf({
      record: {
        ...invoice,
        customer: mergedCustomer,
      },
      rows,
      invoiceMeta: finalMeta,
      issuer: resolveInvoiceIssuer(),
      customerOverride: mergedCustomer,
    });
  };

  const invoiceDrafts = useMemo(() => listInvoiceDrafts(), [financeRefreshTick]);
  const invoices = useMemo(() => listInvoices(), [financeRefreshTick]);
  const invoiceProfile = financeSettings.invoiceProfile || {};

  const filteredDrafts = useMemo(() => {
    const term = financeSearch.trim().toLowerCase();
    if (!term) return invoiceDrafts;
    return invoiceDrafts.filter((draft) => {
      const hay = [
        draft.customerLabel,
        draft.invoiceMeta?.invoiceNumber,
        draft.customer?.customer_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [invoiceDrafts, financeSearch]);

  const filteredInvoices = useMemo(() => {
    const term = financeSearch.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((invoice) => {
      const hay = [
        invoice.customerLabel,
        invoice.invoiceMeta?.invoiceNumber,
        invoice.customer?.customer_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [invoices, financeSearch]);

  const receivables = useMemo(() => {
    return invoices
      .filter((invoice) => !['paid', 'cancelled'].includes(invoice.status))
      .map((invoice) => {
        const invoiceDateValue = invoice?.invoiceMeta?.invoiceDate;
        const paymentDays = Number.parseInt(invoice?.invoiceMeta?.paymentDays || 14, 10);
        const dueDate = invoiceDateValue
          ? new Date(`${invoiceDateValue}T12:00:00`)
          : new Date(invoice.createdAt || Date.now());
        dueDate.setDate(dueDate.getDate() + (Number.isFinite(paymentDays) ? paymentDays : 14));
        const gross = Number(invoice?.totals?.gross || 0);
        const now = new Date();
        const overdue = dueDate.getTime() < now.getTime() && invoice.status !== 'paid';
        return {
          ...invoice,
          dueDate,
          gross,
          overdue,
        };
      });
  }, [invoices]);

  const receivablesSummary = useMemo(() => {
    const openAmount = receivables.reduce((sum, item) => sum + Number(item.gross || 0), 0);
    const overdueAmount = receivables
      .filter((item) => item.overdue)
      .reduce((sum, item) => sum + Number(item.gross || 0), 0);
    return {
      openCount: receivables.length,
      openAmount,
      overdueAmount,
    };
  }, [receivables]);

  const handleFinanceTabChange = (tab) => {
    setActiveTab(tab);
    const url = `${createPageUrl('Customers')}?tab=${encodeURIComponent(tab)}`;
    window.history.replaceState({}, '', url);
  };

  const refreshFinanceData = () => {
    setFinanceRefreshTick((prev) => prev + 1);
  };

  const handleDeleteDraft = (draftId) => {
    deleteInvoiceDraft(draftId);
    refreshFinanceData();
  };

  const handleDeleteInvoice = (invoiceId) => {
    deleteInvoice(invoiceId);
    refreshFinanceData();
  };

  const handleInvoiceStatusChange = (invoiceId, status) => {
    updateInvoiceStatus(invoiceId, status);
    refreshFinanceData();
  };

  const openInvoiceEmailDialog = (invoice) => {
    setSelectedInvoiceForEmail(invoice);
    setInvoiceEmailTarget(resolveInvoiceCustomerEmail(invoice));
    setInvoiceEmailFeedback({ type: '', message: '' });
    setInvoiceEmailDialogOpen(true);
  };

  const handleSendInvoiceToCustomer = async () => {
    const targetEmail = String(invoiceEmailTarget || '').trim();
    if (!selectedInvoiceForEmail) {
      setInvoiceEmailFeedback({ type: 'error', message: 'Rechnung nicht gefunden.' });
      return;
    }
    if (!targetEmail) {
      setInvoiceEmailFeedback({ type: 'error', message: 'Bitte E-Mail-Adresse eingeben.' });
      return;
    }

    setInvoiceEmailSending(true);
    setInvoiceEmailFeedback({ type: '', message: '' });
    try {
      const { arrayBuffer, fileName } = await buildInvoicePdfForEmail(selectedInvoiceForEmail);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Nicht angemeldet.');

      const response = await fetch('/api/admin/send-driver-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          Authorization: `Bearer ${token}`,
          'x-send-customer-invoice-binary': '1',
          'x-customer-invoice-email': targetEmail,
          'x-customer-invoice-number': encodeURIComponent(selectedInvoiceForEmail?.invoiceMeta?.invoiceNumber || ''),
          'x-customer-name': encodeURIComponent(getInvoiceCustomerName(selectedInvoiceForEmail)),
          'x-customer-contact-person': encodeURIComponent(selectedInvoiceForEmail?.invoiceMeta?.contactPerson || ''),
          'x-customer-invoice-file': encodeURIComponent(fileName || ''),
        },
        body: arrayBuffer,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Serverfehler (${response.status})`);
      }
      setInvoiceEmailFeedback({
        type: 'success',
        message: `E-Mail erfolgreich an ${payload?.data?.to || targetEmail} gesendet.`,
      });
    } catch (error) {
      setInvoiceEmailFeedback({
        type: 'error',
        message: error?.message || 'Rechnung konnte nicht versendet werden.',
      });
    } finally {
      setInvoiceEmailSending(false);
    }
  };

  const handleFinanceSettingChange = (field, value) => {
    setFinanceSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleInvoiceProfileChange = (field, value) => {
    setFinanceSettings((prev) => ({
      ...prev,
      invoiceProfile: {
        ...(prev.invoiceProfile || {}),
        [field]: value,
      },
    }));
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      handleInvoiceProfileChange('logoDataUrl', dataUrl);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    handleInvoiceProfileChange('logoDataUrl', '');
  };

  const handleFinanceSettingsSave = () => {
    const profile = financeSettings.invoiceProfile || {};
    const payload = {
      invoicePrefix: String(financeSettings.invoicePrefix || 'AV').trim() || 'AV',
      defaultVatRate: Number.parseFloat(String(financeSettings.defaultVatRate || 19).replace(',', '.')) || 19,
      defaultPaymentDays: Number.parseInt(financeSettings.defaultPaymentDays, 10) || 14,
      nextInvoiceNumber: Number.parseInt(financeSettings.nextInvoiceNumber, 10) || 1000,
      invoiceProfile: {
        companyName: String(profile.companyName || '').trim(),
        companySuffix: String(profile.companySuffix || '').trim(),
        owner: String(profile.owner || '').trim(),
        legalForm: String(profile.legalForm || '').trim(),
        street: String(profile.street || '').trim(),
        postalCode: String(profile.postalCode || '').trim(),
        city: String(profile.city || '').trim(),
        country: String(profile.country || '').trim() || 'Deutschland',
        phone: String(profile.phone || '').trim(),
        fax: String(profile.fax || '').trim(),
        email: String(profile.email || '').trim(),
        website: String(profile.website || '').trim(),
        taxNumber: String(profile.taxNumber || '').trim(),
        vatId: String(profile.vatId || '').trim(),
        bankName: String(profile.bankName || '').trim(),
        accountNumber: String(profile.accountNumber || '').trim(),
        blz: String(profile.blz || '').trim(),
        iban: String(profile.iban || '').trim(),
        bic: String(profile.bic || '').trim(),
        defaultContactPerson: String(profile.defaultContactPerson || '').trim(),
        paymentTerms:
          String(profile.paymentTerms || '').trim() ||
          'Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.',
        logoDataUrl: String(profile.logoDataUrl || ''),
      },
    };
    const saved = saveFinanceSettings(payload);
    setFinanceSettings(saved);
    refreshFinanceData();
  };

  // Form View
  if (view === 'form') {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedCustomer(null);
            window.history.pushState({}, '', createPageUrl('Customers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>{selectedCustomer ? 'Kunde bearbeiten' : 'Neuer Kunde'}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setView('list')}>
                  <X className="w-4 h-4 mr-2" />
                  Abbrechen
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Speichern
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Kundennummer *</Label>
                  <Input 
                    value={formData.customer_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_number: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Kundentyp</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Gewerbekunde</SelectItem>
                      <SelectItem value="private">Privatkunde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="inactive">Inaktiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {formData.type === 'business' && (
                <div>
                  <Label>Firmenname *</Label>
                  <Input 
                    value={formData.company_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Firma GmbH"
                    required={formData.type === 'business'}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Vorname</Label>
                  <Input 
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Nachname</Label>
                  <Input 
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input 
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold">Adresse</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Straße</Label>
                    <AddressAutocomplete
                      value={formData.address}
                      onChange={(value) => setFormData(prev => ({ ...prev, address: value }))}
                      onSelect={({ address, city, postalCode }) => {
                        setFormData(prev => ({
                          ...prev,
                          address,
                          city: city || prev.city,
                          postal_code: postalCode || prev.postal_code,
                        }));
                      }}
                      placeholder="Straße, Hausnummer"
                    />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input 
                      value={formData.postal_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Stadt</Label>
                    <Input 
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Land</Label>
                    <Input 
                      value={formData.country}
                      onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {formData.type === 'business' && (
                <>
                  <Separator />
                  <div>
                    <Label>Steuernummer / USt-ID</Label>
                    <Input 
                      value={formData.tax_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Notizen</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    );
  }

  // Details View
  if (view === 'details' && selectedCustomer) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedCustomer(null);
            window.history.pushState({}, '', createPageUrl('Customers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${selectedCustomer.type === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {selectedCustomer.type === 'business' ? <Building2 className="w-8 h-8" /> : <UserCircle className="w-8 h-8" />}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold">{getCustomerName(selectedCustomer)}</h2>
                    <StatusBadge status={selectedCustomer.status} />
                  </div>
                  <p className="text-gray-500">{selectedCustomer.customer_number}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to={`${createPageUrl('Orders')}?customerId=${selectedCustomer.id}`}>
                  <Button variant="outline">
                    Aufträge anzeigen
                  </Button>
                </Link>
                <Button variant="outline" onClick={() => setView('form')}>
                  <Edit className="w-4 h-4 mr-2" />
                  Bearbeiten
                </Button>
                <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Kontaktinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.first_name && (
                    <div>
                      <p className="text-sm text-gray-500">Vorname</p>
                      <p className="font-medium">{selectedCustomer.first_name}</p>
                    </div>
                  )}
                  {selectedCustomer.last_name && (
                    <div>
                      <p className="text-sm text-gray-500">Nachname</p>
                      <p className="font-medium">{selectedCustomer.last_name}</p>
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div>
                      <p className="text-sm text-gray-500">E-Mail</p>
                      <p className="font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {selectedCustomer.email}
                      </p>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div>
                      <p className="text-sm text-gray-500">Telefon</p>
                      <p className="font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        {selectedCustomer.phone}
                      </p>
                    </div>
                  )}
                </div>
                {(selectedCustomer.address || selectedCustomer.city) && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500 flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4" />
                      Adresse
                    </p>
                    <p className="font-medium">{selectedCustomer.address}</p>
                    <p>{selectedCustomer.postal_code} {selectedCustomer.city}</p>
                    <p className="text-gray-600">{selectedCustomer.country}</p>
                  </div>
                )}
                {selectedCustomer.tax_id && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500">Steuernummer / USt-ID</p>
                    <p className="font-medium">{selectedCustomer.tax_id}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Preisliste</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {priceListMessage && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {priceListMessage}
                  </div>
                )}
                {priceListError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {priceListError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Preisliste (Text)</Label>
                  <Textarea
                    value={priceListText}
                    onChange={(e) => setPriceListText(e.target.value)}
                    rows={4}
                    placeholder="z.B. 0-50 km = 10€\n51-100 km = 20€\n101-150 km = 35€"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePriceListAnalyze}
                    disabled={priceListAnalyzing}
                  >
                    {priceListAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    AI analysieren
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Preis-Staffeln</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPriceListRows((prev) => [...prev, buildEmptyPriceRow()])}
                    >
                      Neue Zeile
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {priceListRows.length === 0 ? (
                      <p className="text-sm text-gray-500">Noch keine Preise hinterlegt.</p>
                    ) : (
                      priceListRows.map((row, index) => (
                        <div
                          key={`price-row-${index}`}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                        >
                          <div>
                            <Label className="text-xs text-slate-500">Von (km)</Label>
                            <Input
                              type="number"
                              value={row.min_km ?? ''}
                              onChange={(e) => handlePriceRowChange(index, 'min_km', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Bis (km)</Label>
                            <Input
                              type="number"
                              value={row.max_km ?? ''}
                              onChange={(e) => handlePriceRowChange(index, 'max_km', e.target.value)}
                              placeholder="offen"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Preis (EUR)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={row.price ?? ''}
                              onChange={(e) => handlePriceRowChange(index, 'price', e.target.value)}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => handlePriceRowRemove(index)}
                            >
                              Entfernen
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={handlePriceListSave}
                  disabled={priceListSaving}
                >
                  {priceListSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Preisliste speichern
                </Button>
              </CardContent>
            </Card>

          </div>

          {selectedCustomer.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Notizen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCustomer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du {getCustomerName(selectedCustomer)} wirklich löschen?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedCustomer.id)}
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden & Finanzen</h1>
          <p className="text-gray-500">
            {customers.length} Kunden • {invoiceDrafts.length} Entwürfe • {invoices.length} Rechnungen
          </p>
        </div>
        {activeTab === 'customers' ? (
          <Button
            className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            onClick={() => {
              setSelectedCustomer(null);
              setView('form');
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Neuer Kunde
          </Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={handleFinanceTabChange} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="customers" className="rounded-xl border border-slate-200 data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f] data-[state=active]:text-white">
            Kunden
          </TabsTrigger>
          <TabsTrigger value="drafts" className="rounded-xl border border-slate-200 data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f] data-[state=active]:text-white">
            Rechnungsentwürfe
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-xl border border-slate-200 data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f] data-[state=active]:text-white">
            Rechnungen
          </TabsTrigger>
          <TabsTrigger value="receivables" className="rounded-xl border border-slate-200 data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f] data-[state=active]:text-white">
            Offene Posten
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl border border-slate-200 data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f] data-[state=active]:text-white">
            Einstellungen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Suche nach Name, Kundennummer, E-Mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">Keine Kunden gefunden</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setView('details');
                    window.history.pushState({}, '', createPageUrl('Customers') + `?id=${customer.id}`);
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${customer.type === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {customer.type === 'business' ? <Building2 className="w-6 h-6" /> : <UserCircle className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{getCustomerName(customer)}</h3>
                        <p className="text-sm text-gray-500">{customer.customer_number}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="drafts" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Entwürfe suchen (Kunde, Rechnungsnummer, Kundennr.)..."
                  value={financeSearch}
                  onChange={(e) => setFinanceSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {filteredDrafts.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Keine Rechnungsentwürfe vorhanden.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Kunde</th>
                        <th className="px-3 py-2">Rechnungsnr.</th>
                        <th className="px-3 py-2">Positionen</th>
                        <th className="px-3 py-2">Zuletzt geändert</th>
                        <th className="px-3 py-2 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDrafts.map((draft) => (
                        <tr key={draft.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">{draft.customerLabel || 'Kunde'}</td>
                          <td className="px-3 py-2">{draft.invoiceMeta?.invoiceNumber || '-'}</td>
                          <td className="px-3 py-2">{Array.isArray(draft.rows) ? draft.rows.length : 0}</td>
                          <td className="px-3 py-2">{formatDate(draft.updatedAt || draft.createdAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <Link to={`${createPageUrl('CustomerInvoice')}?id=${draft.id}`}>
                                <Button size="sm" variant="outline">Öffnen</Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteDraft(draft.id)}
                              >
                                Löschen
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechnungen suchen (Kunde, Rechnungsnummer, Kundennr.)..."
                  value={financeSearch}
                  onChange={(e) => setFinanceSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {filteredInvoices.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Keine Rechnungen vorhanden.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Rechnungsnr.</th>
                        <th className="px-3 py-2">Kunde</th>
                        <th className="px-3 py-2">Rechnungsdatum</th>
                        <th className="px-3 py-2">Betrag brutto</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium">{invoice.invoiceMeta?.invoiceNumber || '-'}</td>
                          <td className="px-3 py-2">{invoice.customerLabel || 'Kunde'}</td>
                          <td className="px-3 py-2">{invoice.invoiceMeta?.invoiceDate || '-'}</td>
                          <td className="px-3 py-2">{formatMoney(invoice?.totals?.gross || 0)}</td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                              value={invoice.status || 'open'}
                              onChange={(event) => handleInvoiceStatusChange(invoice.id, event.target.value)}
                            >
                              <option value="open">Offen</option>
                              <option value="partially_paid">Teilbezahlt</option>
                              <option value="paid">Bezahlt</option>
                              <option value="overdue">Überfällig</option>
                              <option value="cancelled">Storniert</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => openInvoiceEmailDialog(invoice)}
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                Senden
                              </Button>
                              <Link to={`${createPageUrl('CustomerInvoice')}?invoiceId=${invoice.id}`}>
                                <Button size="sm" variant="outline">Öffnen</Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteInvoice(invoice.id)}
                              >
                                Löschen
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Offene Rechnungen</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{receivablesSummary.openCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Offener Betrag</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(receivablesSummary.openAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-red-600">Überfällig</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">{formatMoney(receivablesSummary.overdueAmount)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {receivables.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Keine offenen Posten.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Rechnungsnr.</th>
                        <th className="px-3 py-2">Kunde</th>
                        <th className="px-3 py-2">Fällig am</th>
                        <th className="px-3 py-2">Offen</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.map((item) => (
                        <tr key={item.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium">{item.invoiceMeta?.invoiceNumber || '-'}</td>
                          <td className="px-3 py-2">{item.customerLabel || 'Kunde'}</td>
                          <td className="px-3 py-2">{format(item.dueDate, 'dd.MM.yyyy', { locale: de })}</td>
                          <td className="px-3 py-2">{formatMoney(item.gross)}</td>
                          <td className="px-3 py-2">
                            {item.overdue ? (
                              <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Überfällig</span>
                            ) : (
                              <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Offen</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Finanz-Einstellungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Allgemein</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Rechnungspräfix</Label>
                    <Input
                      value={financeSettings.invoicePrefix || 'AV'}
                      onChange={(e) => handleFinanceSettingChange('invoicePrefix', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Standard MwSt. (%)</Label>
                    <Input
                      value={financeSettings.defaultVatRate ?? 19}
                      onChange={(e) => handleFinanceSettingChange('defaultVatRate', e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Standard Zahlungsziel (Tage)</Label>
                    <Input
                      value={financeSettings.defaultPaymentDays ?? 14}
                      onChange={(e) => handleFinanceSettingChange('defaultPaymentDays', e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Nächste Rechnungsnummer</Label>
                    <Input
                      value={financeSettings.nextInvoiceNumber ?? 1000}
                      onChange={(e) => handleFinanceSettingChange('nextInvoiceNumber', e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Briefkopf & Unternehmen</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Firma</Label>
                    <Input
                      value={invoiceProfile.companyName || ''}
                      onChange={(e) => handleInvoiceProfileChange('companyName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Firmenzusatz</Label>
                    <Input
                      value={invoiceProfile.companySuffix || ''}
                      onChange={(e) => handleInvoiceProfileChange('companySuffix', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Inhaber</Label>
                    <Input
                      value={invoiceProfile.owner || ''}
                      onChange={(e) => handleInvoiceProfileChange('owner', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Rechtsform</Label>
                    <Input
                      value={invoiceProfile.legalForm || ''}
                      onChange={(e) => handleInvoiceProfileChange('legalForm', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Adresse</Label>
                    <Input
                      value={invoiceProfile.street || ''}
                      onChange={(e) => handleInvoiceProfileChange('street', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>PLZ</Label>
                    <Input
                      value={invoiceProfile.postalCode || ''}
                      onChange={(e) => handleInvoiceProfileChange('postalCode', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Stadt</Label>
                    <Input
                      value={invoiceProfile.city || ''}
                      onChange={(e) => handleInvoiceProfileChange('city', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Land</Label>
                    <Input
                      value={invoiceProfile.country || ''}
                      onChange={(e) => handleInvoiceProfileChange('country', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Kontakt & Steuern</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Telefon</Label>
                    <Input
                      value={invoiceProfile.phone || ''}
                      onChange={(e) => handleInvoiceProfileChange('phone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>FAX</Label>
                    <Input
                      value={invoiceProfile.fax || ''}
                      onChange={(e) => handleInvoiceProfileChange('fax', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>E-Mail-Adresse</Label>
                    <Input
                      value={invoiceProfile.email || ''}
                      onChange={(e) => handleInvoiceProfileChange('email', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Webseite</Label>
                    <Input
                      value={invoiceProfile.website || ''}
                      onChange={(e) => handleInvoiceProfileChange('website', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Steuernummer</Label>
                    <Input
                      value={invoiceProfile.taxNumber || ''}
                      onChange={(e) => handleInvoiceProfileChange('taxNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Umsatzsteuer-ID</Label>
                    <Input
                      value={invoiceProfile.vatId || ''}
                      onChange={(e) => handleInvoiceProfileChange('vatId', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Bankdaten</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Bankname</Label>
                    <Input
                      value={invoiceProfile.bankName || ''}
                      onChange={(e) => handleInvoiceProfileChange('bankName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Kontonummer</Label>
                    <Input
                      value={invoiceProfile.accountNumber || ''}
                      onChange={(e) => handleInvoiceProfileChange('accountNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>BLZ</Label>
                    <Input
                      value={invoiceProfile.blz || ''}
                      onChange={(e) => handleInvoiceProfileChange('blz', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>IBAN</Label>
                    <Input
                      value={invoiceProfile.iban || ''}
                      onChange={(e) => handleInvoiceProfileChange('iban', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>BIC</Label>
                    <Input
                      value={invoiceProfile.bic || ''}
                      onChange={(e) => handleInvoiceProfileChange('bic', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Rechnungstext & Logo</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Standard Ansprechpartner</Label>
                    <Input
                      value={invoiceProfile.defaultContactPerson || ''}
                      onChange={(e) => handleInvoiceProfileChange('defaultContactPerson', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Zahlungsbedingungen ({'{days}'} als Platzhalter)</Label>
                    <Textarea
                      value={invoiceProfile.paymentTerms || ''}
                      onChange={(e) => handleInvoiceProfileChange('paymentTerms', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Logo (oben rechts auf Rechnung)</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="max-w-md"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRemoveLogo}
                        disabled={!invoiceProfile.logoDataUrl}
                      >
                        Logo entfernen
                      </Button>
                      {logoUploading ? <span className="text-sm text-slate-500">Logo wird geladen…</span> : null}
                    </div>
                    {invoiceProfile.logoDataUrl ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                        <img src={invoiceProfile.logoDataUrl} alt="Logo Vorschau" className="h-16 w-auto object-contain" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" onClick={handleFinanceSettingsSave}>
                Einstellungen speichern
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={invoiceEmailDialogOpen}
        onOpenChange={(open) => {
          if (invoiceEmailSending) return;
          setInvoiceEmailDialogOpen(open);
          if (!open) {
            setInvoiceEmailFeedback({ type: '', message: '' });
            setSelectedInvoiceForEmail(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechnung an Kunden senden</DialogTitle>
            <DialogDescription>
              Bitte E-Mail prüfen. Die Rechnung wird als PDF-Anhang versendet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Kunden-E-Mail</Label>
              <Input
                type="email"
                value={invoiceEmailTarget}
                onChange={(event) => setInvoiceEmailTarget(event.target.value)}
                placeholder="kunde@firma.de"
              />
            </div>
            {selectedInvoiceForEmail ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  Rechnung: <span className="font-semibold">{selectedInvoiceForEmail?.invoiceMeta?.invoiceNumber || '-'}</span>
                </p>
                <p>
                  Kunde: <span className="font-semibold">{getInvoiceCustomerName(selectedInvoiceForEmail)}</span>
                </p>
              </div>
            ) : null}
            {invoiceEmailFeedback.message ? (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  invoiceEmailFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {invoiceEmailFeedback.message}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoiceEmailDialogOpen(false)}
              disabled={invoiceEmailSending}
            >
              {invoiceEmailFeedback.type === 'success' ? 'Schließen' : 'Abbrechen'}
            </Button>
            {invoiceEmailFeedback.type !== 'success' ? (
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSendInvoiceToCustomer}
                disabled={!invoiceEmailTarget.trim() || invoiceEmailSending}
              >
                {invoiceEmailSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rechnung wird versendet…
                  </>
                ) : (
                  'Senden'
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
