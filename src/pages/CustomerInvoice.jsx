import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, Loader2, TriangleAlert, Save, CheckCircle2, ArrowLeft } from 'lucide-react';
import {
  consumeNextInvoiceNumber,
  finalizeDraftToInvoice,
  getFinanceSettings,
  getInvoice,
  getInvoiceDraft,
  upsertInvoice,
  upsertInvoiceDraft,
} from '@/utils/invoiceStorage';
import { buildCustomerInvoicePdf } from '@/utils/customerInvoicePdf';

const DEFAULT_ISSUER = {
  name: 'AVO LOGISTICS',
  companySuffix: '',
  legalForm: '',
  street: 'Collenbachstraße 1',
  postalCode: '40476',
  city: 'Düsseldorf',
  country: 'Deutschland',
  phone: '+49 17624273014',
  fax: '',
  email: 'info@avo-logistics.de',
  web: 'www.avo-logistics.de',
  vatId: 'DE361070222',
  taxNumber: '10350222746',
  owner: 'Achraf Bolakhrif',
  bankName: 'Stadtsparkasse Düsseldorf',
  accountNumber: '',
  blz: '',
  iban: 'DE98 3005 0110 1009 0619 02',
  bic: 'DUSSDEDDXXX',
  defaultContactPerson: 'Achraf Bolakhrif',
  paymentTerms: 'Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.',
};

const parseMoneyInput = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMoneyInput = (value) => {
  const parsed = Number.parseFloat(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toFixed(2).replace('.', ',');
};

const formatCurrencyValue = (value) =>
  Number(value || 0).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatEuroText = (value) =>
  `${Number(value || 0).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;

const grossToNet = (grossValue, vatRateValue) => {
  const gross = Number(grossValue || 0);
  const vatRate = Number(vatRateValue || 0);
  if (!Number.isFinite(gross)) return 0;
  if (!Number.isFinite(vatRate) || vatRate <= 0) return gross;
  return gross / (1 + vatRate / 100);
};

const sanitizeFileNamePart = (value, maxLength = 60) => {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
};

const toDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
};

const parseGermanDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const loadImageAsDataUrl = async (src) => {
  try {
    const response = await fetch(src);
    if (!response.ok) return '';
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return '';
  }
};

const mergeCustomerData = (record, customerOverride = null) => {
  const snapshot = record?.customer && typeof record.customer === 'object' ? record.customer : {};
  const latest = customerOverride && typeof customerOverride === 'object' ? customerOverride : {};
  return {
    ...snapshot,
    ...latest,
  };
};

const getCustomerName = (record, customerOverride = null) => {
  const customer = mergeCustomerData(record, customerOverride);
  if (customer?.type === 'business' && customer?.company_name) {
    return customer.company_name;
  }
  const fullName = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || record?.customerLabel || 'Kunde';
};

const getCustomerAddressLines = (record, customerOverride = null) => {
  const customer = mergeCustomerData(record, customerOverride);
  const lines = [];
  lines.push(getCustomerName(record, customerOverride));
  const contactName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ').trim();
  if (customer?.type === 'business' && customer?.company_name && contactName) {
    lines.push(`z. Hd. ${contactName}`);
  }
  if (customer?.address) lines.push(customer.address);
  const cityLine = [customer?.postal_code, customer?.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (customer?.country) lines.push(customer.country);
  if (lines.length === 1 && customer?.email) lines.push(customer.email);
  return lines;
};

const splitRouteToAddresses = (route) => {
  const raw = String(route || '').trim();
  if (!raw) return { pickupAddress: '-', dropoffAddress: '-' };
  const parts = raw.split(/\s*->\s*/);
  if (parts.length >= 2) {
    return {
      pickupAddress: parts[0]?.trim() || '-',
      dropoffAddress: parts.slice(1).join(' -> ').trim() || '-',
    };
  }
  return { pickupAddress: raw, dropoffAddress: '-' };
};

const buildInvoiceNumber = () => {
  const settings = getFinanceSettings();
  const prefix = String(settings.invoicePrefix || 'AV').trim() || 'AV';
  const sequence = consumeNextInvoiceNumber();
  const sequenceLabel = String(sequence).padStart(4, '0');
  return `${prefix}-${format(new Date(), 'yy')}${sequenceLabel}`;
};

export default function CustomerInvoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('id') || '';
  const invoiceId = searchParams.get('invoiceId') || '';
  const legacyDraftId = searchParams.get('draft') || '';
  const isInvoice = Boolean(invoiceId);

  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });

  const appSettings = appSettingsList[0] || null;

  useEffect(() => {
    let active = true;
    appClient.auth.getCurrentUser().then((user) => {
      if (active) setCurrentUser(user);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!legacyDraftId || draftId || invoiceId || typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem(`avo:customer-invoice-draft:${legacyDraftId}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const newDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      upsertInvoiceDraft({
        ...parsed,
        id: newDraftId,
        status: 'draft',
      });
      window.sessionStorage.removeItem(`avo:customer-invoice-draft:${legacyDraftId}`);
      navigate(`${createPageUrl('CustomerInvoice')}?id=${encodeURIComponent(newDraftId)}`, {
        replace: true,
      });
    } catch (error) {
      // ignore
    }
  }, [legacyDraftId, draftId, invoiceId, navigate]);

  const record = useMemo(() => {
    if (invoiceId) return getInvoice(invoiceId);
    if (draftId) return getInvoiceDraft(draftId);
    return null;
  }, [invoiceId, draftId]);

  const customerProfileId = useMemo(() => {
    if (!record) return '';
    if (record?.customer?.id) return String(record.customer.id);
    if (record?.customerKey && record.customerKey !== '__none__') return String(record.customerKey);
    return '';
  }, [record]);

  const { data: customerProfileList = [] } = useQuery({
    queryKey: ['invoice-customer-profile', customerProfileId],
    enabled: Boolean(customerProfileId),
    queryFn: () => appClient.entities.Customer.filter({ id: customerProfileId }),
  });

  const customerProfile = customerProfileList[0] || null;
  const mergedCustomer = useMemo(
    () => mergeCustomerData(record, customerProfile),
    [record, customerProfile]
  );

  const financeDefaults = useMemo(() => getFinanceSettings(), [record?.id]);

  const initialRows = useMemo(() => {
    if (!record?.rows || !Array.isArray(record.rows)) return [];
    return record.rows.map((row, index) => {
      const fallbackAddresses = splitRouteToAddresses(row.routeDraft || row.route || '');
      const pickupAddress = row.pickupAddress || row.pickup_address || fallbackAddresses.pickupAddress || '';
      const dropoffAddress = row.dropoffAddress || row.dropoff_address || fallbackAddresses.dropoffAddress || '';
      const routeDraft = row.routeDraft || row.route || `${pickupAddress || '-'} -> ${dropoffAddress || '-'}`;
      return {
        id: row.id || `row_${index}`,
        orderNumber: row.orderNumber || '-',
        dateLabel: row.dateLabel || '',
        routeDraft,
        pickupAddress,
        dropoffAddress,
        vehicle: row.vehicle || '-',
        plate: row.plate || row.license_plate || '',
        orderPriceDraft: toMoneyInput(row.orderPriceDraft ?? row.orderPrice),
        fuelExpensesDraft: toMoneyInput(row.fuelExpensesDraft ?? row.fuelExpenses),
      };
    });
  }, [record]);

  const latestDeliveryDate = useMemo(() => {
    const parsedDates = initialRows
      .map((row) => parseGermanDate(row.dateLabel))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());
    return parsedDates[0] || new Date();
  }, [initialRows]);

  const [rows, setRows] = useState(initialRows);
  const [invoiceMeta, setInvoiceMeta] = useState({
    invoiceNumber: '',
    invoiceDate: '',
    deliveryDate: '',
    customerNumber: '',
    contactPerson: '',
    paymentDays: '14',
    vatRate: '19',
    includeFuel: true,
  });

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (!record) return;
    const profile = financeDefaults.invoiceProfile || {};
    const defaultContact =
      profile.defaultContactPerson ||
      currentUser?.full_name ||
      currentUser?.name ||
      currentUser?.email ||
      DEFAULT_ISSUER.owner;
    const meta = record.invoiceMeta || {};
    setInvoiceMeta({
      invoiceNumber: meta.invoiceNumber || '',
      invoiceDate: toDateInput(meta.invoiceDate || new Date()),
      deliveryDate: toDateInput(meta.deliveryDate || latestDeliveryDate),
      customerNumber: meta.customerNumber || mergedCustomer?.customer_number || '',
      contactPerson: meta.contactPerson || defaultContact,
      paymentDays: String(meta.paymentDays || financeDefaults.defaultPaymentDays || 14),
      vatRate: String(meta.vatRate ?? financeDefaults.defaultVatRate ?? 19),
      includeFuel: meta.includeFuel !== false,
    });
  }, [
    record,
    currentUser,
    latestDeliveryDate,
    mergedCustomer?.customer_number,
    financeDefaults.defaultPaymentDays,
    financeDefaults.defaultVatRate,
    financeDefaults.invoiceProfile,
  ]);

  const issuer = useMemo(() => {
    const profile = financeDefaults.invoiceProfile || {};
    const officeAddress = String(appSettings?.office_address || '').trim();
    const [officeStreetRaw = '', officeCityRaw = '', officeCountryRaw = ''] = officeAddress
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean);

    const street = profile.street || officeStreetRaw || DEFAULT_ISSUER.street;
    const cityMatch = officeCityRaw.match(/^(\d{4,5})\s+(.+)$/);
    const postalCode = profile.postalCode || cityMatch?.[1] || DEFAULT_ISSUER.postalCode;
    const city = profile.city || cityMatch?.[2] || officeCityRaw || DEFAULT_ISSUER.city;
    const country = profile.country || officeCountryRaw || DEFAULT_ISSUER.country;

    return {
      ...DEFAULT_ISSUER,
      name: profile.companyName || appSettings?.company_name || DEFAULT_ISSUER.name,
      companySuffix: profile.companySuffix || '',
      legalForm: profile.legalForm || '',
      street,
      postalCode,
      city,
      country,
      phone: profile.phone || appSettings?.support_phone || DEFAULT_ISSUER.phone,
      fax: profile.fax || DEFAULT_ISSUER.fax,
      email: profile.email || appSettings?.support_email || DEFAULT_ISSUER.email,
      web: profile.website || DEFAULT_ISSUER.web,
      taxNumber: profile.taxNumber || DEFAULT_ISSUER.taxNumber,
      vatId: profile.vatId || DEFAULT_ISSUER.vatId,
      bankName: profile.bankName || DEFAULT_ISSUER.bankName,
      accountNumber: profile.accountNumber || DEFAULT_ISSUER.accountNumber,
      blz: profile.blz || DEFAULT_ISSUER.blz,
      iban: profile.iban || DEFAULT_ISSUER.iban,
      bic: profile.bic || DEFAULT_ISSUER.bic,
      owner: profile.owner || DEFAULT_ISSUER.owner,
      paymentTerms: profile.paymentTerms || DEFAULT_ISSUER.paymentTerms,
      logoDataUrl: profile.logoDataUrl || '',
    };
  }, [appSettings, financeDefaults.invoiceProfile]);

  const summary = useMemo(() => {
    const vatRate = parseMoneyInput(invoiceMeta.vatRate);
    const includeFuel = invoiceMeta.includeFuel !== false;
    const orderNet = rows.reduce((sum, row) => {
      const orderNetValue = parseMoneyInput(row.orderPriceDraft);
      return sum + orderNetValue;
    }, 0);
    const fuelNet = rows.reduce((sum, row) => {
      const fuelGross = includeFuel ? parseMoneyInput(row.fuelExpensesDraft) : 0;
      return sum + grossToNet(fuelGross, vatRate);
    }, 0);
    const net = orderNet + fuelNet;
    const fuelGross = rows.reduce((sum, row) => {
      return sum + (includeFuel ? parseMoneyInput(row.fuelExpensesDraft) : 0);
    }, 0);
    const vatAmount = net * (vatRate / 100);
    const gross = net + vatAmount;
    return {
      orderCount: rows.length,
      orderNet,
      net,
      vatRate,
      vatAmount,
      gross,
      fuelNet,
      fuelGross,
      includeFuel,
    };
  }, [rows, invoiceMeta.vatRate, invoiceMeta.includeFuel]);

  const normalizedRowsForSave = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      dateLabel: String(row.dateLabel || '').trim(),
      route: String(row.routeDraft || '').trim(),
      routeDraft: String(row.routeDraft || '').trim(),
      pickupAddress: String(row.pickupAddress || '').trim(),
      dropoffAddress: String(row.dropoffAddress || '').trim(),
      vehicle: row.vehicle,
      plate: String(row.plate || '').trim(),
      orderPrice: parseMoneyInput(row.orderPriceDraft),
      orderPriceDraft: row.orderPriceDraft,
      fuelExpenses: parseMoneyInput(row.fuelExpensesDraft),
      fuelExpensesDraft: row.fuelExpensesDraft,
    }));
  }, [rows]);

  const handleRowChange = (rowId, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, [field]: value };
        if (field === 'pickupAddress' || field === 'dropoffAddress') {
          const pickup = String(field === 'pickupAddress' ? value : next.pickupAddress || '').trim() || '-';
          const dropoff = String(field === 'dropoffAddress' ? value : next.dropoffAddress || '').trim() || '-';
          next.routeDraft = `${pickup} -> ${dropoff}`;
        }
        return next;
      })
    );
  };

  const handleFuelNetChange = (rowId, value) => {
    const vatRate = parseMoneyInput(invoiceMeta.vatRate);
    const fuelNet = parseMoneyInput(value);
    const grossFactor = vatRate > 0 ? 1 + vatRate / 100 : 1;
    const grossFuel = fuelNet * grossFactor;
    handleRowChange(rowId, 'fuelExpensesDraft', toMoneyInput(grossFuel));
  };

  const handleMetaChange = (field, value) => {
    setInvoiceMeta((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!record) return;
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        ...record,
        customer: mergedCustomer,
        rows: normalizedRowsForSave,
        invoiceMeta,
        totals: {
          net: summary.net,
          vatRate: summary.vatRate,
          vatAmount: summary.vatAmount,
          gross: summary.gross,
          fuelNet: summary.fuelNet,
          fuelGross: summary.fuelGross,
        },
      };
      if (isInvoice) {
        upsertInvoice(payload);
      } else {
        upsertInvoiceDraft(payload);
      }
      setMessage(isInvoice ? 'Rechnung gespeichert.' : 'Entwurf gespeichert.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = () => {
    if (!record || isInvoice) return;
    setFinalizing(true);
    setMessage('');
    try {
      const finalMeta = {
        ...invoiceMeta,
        invoiceNumber: invoiceMeta.invoiceNumber || buildInvoiceNumber(),
      };
      const invoice = finalizeDraftToInvoice(record.id, {
        ...record,
        customer: mergedCustomer,
        rows: normalizedRowsForSave,
        invoiceMeta: finalMeta,
        totals: {
          net: summary.net,
          vatRate: summary.vatRate,
          vatAmount: summary.vatAmount,
          gross: summary.gross,
          fuelNet: summary.fuelNet,
          fuelGross: summary.fuelGross,
        },
        status: 'open',
      });
      if (!invoice?.id) return;
      setMessage('Rechnung wurde finalisiert und unter Rechnungen gespeichert.');
      navigate(`${createPageUrl('CustomerInvoice')}?invoiceId=${encodeURIComponent(invoice.id)}`, {
        replace: true,
      });
    } finally {
      setFinalizing(false);
    }
  };

  const downloadInvoicePdf = async () => {
    if (!rows.length || !record) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const finalMeta = {
        ...invoiceMeta,
        invoiceNumber: invoiceMeta.invoiceNumber || (isInvoice ? '-' : buildInvoiceNumber()),
      };
      const { arrayBuffer, fileName } = await buildCustomerInvoicePdf({
        record,
        rows,
        invoiceMeta: finalMeta,
        issuer: {
          ...issuer,
          paymentTerms: issuer.paymentTerms || DEFAULT_ISSUER.paymentTerms,
        },
        customerOverride: mergedCustomer,
      });
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error?.message || 'PDF-Download fehlgeschlagen.');
    } finally {
      setDownloading(false);
    }
  };

  if (!record || !rows.length) {
    return (
      <div className="space-y-4">
        <Card className="border border-amber-200 bg-amber-50">
          <CardContent className="py-8 text-center">
            <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-amber-600" />
            <p className="font-medium text-amber-900">Rechnungsentwurf nicht gefunden</p>
            <p className="mt-1 text-sm text-amber-800">
              Bitte öffne die Rechnung erneut über „Mit Kunden abrechnen" oder über „Kunden & Finanzen".
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link to={createPageUrl('Orders')}>
            <Button variant="outline">Zurück zu Aufträgen</Button>
          </Link>
          <Link to={`${createPageUrl('Customers')}?tab=drafts`}>
            <Button variant="outline">Zu Kunden & Finanzen</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(`${createPageUrl('Customers')}?tab=${isInvoice ? 'invoices' : 'drafts'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur letzten Seite
        </Button>
      </div>
      <Card className="border border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{isInvoice ? 'Rechnung' : 'Rechnungsentwurf'}</CardTitle>
              <p className="text-sm text-slate-500">
                Kunde: <span className="font-medium text-slate-900">{getCustomerName(record)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || finalizing}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isInvoice ? 'Speichern' : 'Entwurf speichern'}
              </Button>
              {!isInvoice ? (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleFinalize}
                  disabled={saving || finalizing}
                >
                  {finalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Finalisieren
                </Button>
              ) : null}
              <Button
                className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                onClick={downloadInvoicePdf}
                disabled={downloading || rows.length === 0}
              >
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Rechnung als PDF herunterladen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="space-y-1 xl:col-span-2">
              <p className="text-xs text-slate-500">Rechnungsnummer</p>
              <Input
                value={invoiceMeta.invoiceNumber}
                onChange={(event) => handleMetaChange('invoiceNumber', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Rechnungsdatum</p>
              <Input
                type="date"
                value={invoiceMeta.invoiceDate}
                onChange={(event) => handleMetaChange('invoiceDate', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Lieferdatum</p>
              <Input
                type="date"
                value={invoiceMeta.deliveryDate}
                onChange={(event) => handleMetaChange('deliveryDate', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Kundennummer</p>
              <Input
                value={invoiceMeta.customerNumber}
                onChange={(event) => handleMetaChange('customerNumber', event.target.value)}
              />
            </div>
            <div className="space-y-1 xl:col-span-2">
              <p className="text-xs text-slate-500">Ansprechpartner</p>
              <Input
                value={invoiceMeta.contactPerson}
                onChange={(event) => handleMetaChange('contactPerson', event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={invoiceMeta.includeFuel !== false}
                onChange={(event) => handleMetaChange('includeFuel', event.target.checked)}
              />
              Tank-Auslagen für die gesamte Rechnung abrechnen
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-8">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Positionen</p>
              <p className="font-semibold text-slate-900">{summary.orderCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Netto (Rechnung)</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.net)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Tank Netto</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.fuelNet)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Tank Brutto</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.fuelGross)}</p>
            </div>
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">MwSt. %</p>
              <Input
                value={invoiceMeta.vatRate}
                onChange={(event) => handleMetaChange('vatRate', event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">MwSt. Betrag</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.vatAmount)}</p>
            </div>
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Zahlungsziel (Tage)</p>
              <Input
                value={invoiceMeta.paymentDays}
                onChange={(event) => handleMetaChange('paymentDays', event.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
              <p className="text-xs text-emerald-700">Brutto</p>
              <p className="font-semibold text-emerald-900">{formatCurrencyValue(summary.gross)}</p>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Pos.</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Kennzeichen</th>
                  <th className="px-3 py-2">Abholadresse</th>
                  <th className="px-3 py-2">Lieferadresse</th>
                  <th className="px-3 py-2 text-right">Auftragspreis</th>
                  <th className="px-3 py-2 text-right">Betankung (Netto)</th>
                  <th className="px-3 py-2 text-right">Gesamtpreis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const orderPrice = parseMoneyInput(row.orderPriceDraft);
                  const fuelExpensesRaw = parseMoneyInput(row.fuelExpensesDraft);
                  const fuelIncluded = invoiceMeta.includeFuel === false ? 0 : fuelExpensesRaw;
                  const fuelNet = grossToNet(fuelIncluded, summary.vatRate);
                  const lineNet = orderPrice + fuelNet;
                  return (
                    <tr key={row.id} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="min-w-[120px] px-3 py-2">
                        <Input
                          value={row.dateLabel}
                          onChange={(event) => handleRowChange(row.id, 'dateLabel', event.target.value)}
                          placeholder="dd.MM.yyyy"
                        />
                      </td>
                      <td className="min-w-[120px] px-3 py-2">
                        <Input
                          value={row.plate}
                          onChange={(event) => handleRowChange(row.id, 'plate', event.target.value)}
                          placeholder="Kennzeichen"
                        />
                      </td>
                      <td className="min-w-[260px] px-3 py-2">
                        <Textarea
                          value={row.pickupAddress}
                          onChange={(event) => handleRowChange(row.id, 'pickupAddress', event.target.value)}
                          rows={2}
                          placeholder="Abholadresse"
                        />
                      </td>
                      <td className="min-w-[260px] px-3 py-2">
                        <Textarea
                          value={row.dropoffAddress}
                          onChange={(event) => handleRowChange(row.id, 'dropoffAddress', event.target.value)}
                          rows={2}
                          placeholder="Lieferadresse"
                        />
                      </td>
                      <td className="min-w-[160px] px-3 py-2">
                        <Input
                          value={row.orderPriceDraft}
                          onChange={(event) => handleRowChange(row.id, 'orderPriceDraft', event.target.value)}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="min-w-[170px] px-3 py-2">
                        <Input
                          value={toMoneyInput(fuelNet)}
                          onChange={(event) => handleFuelNetChange(row.id, event.target.value)}
                          inputMode="decimal"
                          disabled={invoiceMeta.includeFuel === false}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrencyValue(lineNet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {downloadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {downloadError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
