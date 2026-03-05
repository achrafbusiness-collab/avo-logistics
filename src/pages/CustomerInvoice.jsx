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
import { Download, Loader2, TriangleAlert, Save, CheckCircle2 } from 'lucide-react';
import {
  consumeNextInvoiceNumber,
  finalizeDraftToInvoice,
  getFinanceSettings,
  getInvoice,
  getInvoiceDraft,
  upsertInvoice,
  upsertInvoiceDraft,
} from '@/utils/invoiceStorage';

const DEFAULT_ISSUER = {
  name: 'AVO LOGISTICS',
  street: 'Collenbachstraße 1',
  postalCode: '40476',
  city: 'Düsseldorf',
  country: 'Deutschland',
  phone: '+49 17624273014',
  email: 'info@avo-logistics.de',
  web: 'www.avo-logistics.de',
  vatId: 'DE361070222',
  taxNumber: '10350222746',
  owner: 'Achraf Bolakhrif',
  bankName: 'Stadtsparkasse Düsseldorf',
  iban: 'DE98 3005 0110 1009 0619 02',
  bic: 'DUSSDEDDXXX',
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

const getCustomerName = (record) => {
  if (record?.customer?.type === 'business' && record.customer?.company_name) {
    return record.customer.company_name;
  }
  const fullName = [record?.customer?.first_name, record?.customer?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || record?.customerLabel || 'Kunde';
};

const getCustomerAddressLines = (record) => {
  const lines = [];
  lines.push(getCustomerName(record));
  if (record?.customer?.address) lines.push(record.customer.address);
  const cityLine = [record?.customer?.postal_code, record?.customer?.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (record?.customer?.country) lines.push(record.customer.country);
  if (lines.length === 1 && record?.customer?.email) lines.push(record.customer.email);
  return lines;
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

  const financeDefaults = useMemo(() => getFinanceSettings(), [record?.id]);

  const initialRows = useMemo(() => {
    if (!record?.rows || !Array.isArray(record.rows)) return [];
    return record.rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber || '-',
      dateLabel: row.dateLabel || '-',
      routeDraft: row.routeDraft || row.route || '-',
      vehicle: row.vehicle || '-',
      plate: row.plate || '-',
      orderPriceDraft: toMoneyInput(row.orderPriceDraft ?? row.orderPrice),
      fuelExpensesDraft: toMoneyInput(row.fuelExpensesDraft ?? row.fuelExpenses),
    }));
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
  });

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (!record) return;
    const defaultContact =
      currentUser?.full_name || currentUser?.name || currentUser?.email || DEFAULT_ISSUER.owner;
    const meta = record.invoiceMeta || {};
    setInvoiceMeta({
      invoiceNumber: meta.invoiceNumber || '',
      invoiceDate: toDateInput(meta.invoiceDate || new Date()),
      deliveryDate: toDateInput(meta.deliveryDate || latestDeliveryDate),
      customerNumber: meta.customerNumber || record?.customer?.customer_number || '',
      contactPerson: meta.contactPerson || defaultContact,
      paymentDays: String(meta.paymentDays || financeDefaults.defaultPaymentDays || 14),
      vatRate: String(meta.vatRate ?? financeDefaults.defaultVatRate ?? 19),
    });
  }, [record, currentUser, latestDeliveryDate, financeDefaults.defaultPaymentDays, financeDefaults.defaultVatRate]);

  const issuer = useMemo(() => {
    const officeAddress = String(appSettings?.office_address || '').trim();
    const [officeStreetRaw = '', officeCityRaw = '', officeCountryRaw = ''] = officeAddress
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean);

    const street = officeStreetRaw || DEFAULT_ISSUER.street;
    const cityMatch = officeCityRaw.match(/^(\d{4,5})\s+(.+)$/);
    const postalCode = cityMatch?.[1] || DEFAULT_ISSUER.postalCode;
    const city = cityMatch?.[2] || officeCityRaw || DEFAULT_ISSUER.city;
    const country = officeCountryRaw || DEFAULT_ISSUER.country;

    return {
      ...DEFAULT_ISSUER,
      name: appSettings?.company_name || DEFAULT_ISSUER.name,
      street,
      postalCode,
      city,
      country,
      phone: appSettings?.support_phone || DEFAULT_ISSUER.phone,
      email: appSettings?.support_email || DEFAULT_ISSUER.email,
    };
  }, [appSettings]);

  const summary = useMemo(() => {
    const net = rows.reduce((sum, row) => {
      const orderPrice = parseMoneyInput(row.orderPriceDraft);
      const fuelExpenses = parseMoneyInput(row.fuelExpensesDraft);
      return sum + orderPrice + fuelExpenses;
    }, 0);
    const vatRate = parseMoneyInput(invoiceMeta.vatRate);
    const vatAmount = net * (vatRate / 100);
    const gross = net + vatAmount;
    return {
      orderCount: rows.length,
      net,
      vatRate,
      vatAmount,
      gross,
    };
  }, [rows, invoiceMeta.vatRate]);

  const normalizedRowsForSave = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      dateLabel: row.dateLabel,
      route: row.routeDraft,
      routeDraft: row.routeDraft,
      vehicle: row.vehicle,
      plate: row.plate,
      orderPrice: parseMoneyInput(row.orderPriceDraft),
      orderPriceDraft: row.orderPriceDraft,
      fuelExpenses: parseMoneyInput(row.fuelExpensesDraft),
      fuelExpensesDraft: row.fuelExpensesDraft,
    }));
  }, [rows]);

  const handleRowChange = (rowId, field, value) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
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
        rows: normalizedRowsForSave,
        invoiceMeta,
        totals: {
          net: summary.net,
          vatRate: summary.vatRate,
          vatAmount: summary.vatAmount,
          gross: summary.gross,
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
        rows: normalizedRowsForSave,
        invoiceMeta: finalMeta,
        totals: {
          net: summary.net,
          vatRate: summary.vatRate,
          vatAmount: summary.vatAmount,
          gross: summary.gross,
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
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const finalMeta = {
        ...invoiceMeta,
        invoiceNumber: invoiceMeta.invoiceNumber || (isInvoice ? '-' : buildInvoiceNumber()),
      };

      const logoDataUrl = await loadImageAsDataUrl('/logo.png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      doc.setFont('helvetica', 'normal');
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', 154, 12, 40, 18);
      } else {
        doc.setFontSize(16);
        doc.text(issuer.name, 194, 22, { align: 'right' });
      }

      doc.setFontSize(8.5);
      doc.text(
        `${issuer.name} - ${issuer.street} - ${issuer.postalCode} ${issuer.city}`,
        20,
        45
      );

      const customerLines = getCustomerAddressLines(record);
      doc.setFontSize(11);
      customerLines.forEach((line, index) => {
        doc.text(line, 20, 57 + index * 6);
      });

      const invoiceTopY = 57;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Rechnungs-Nr.', 130, invoiceTopY);
      doc.text(finalMeta.invoiceNumber || '-', 194, invoiceTopY, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Rechnungsdatum', 130, invoiceTopY + 8);
      doc.text(finalMeta.invoiceDate || '-', 194, invoiceTopY + 8, { align: 'right' });
      doc.text('Lieferdatum', 130, invoiceTopY + 15);
      doc.text(finalMeta.deliveryDate || '-', 194, invoiceTopY + 15, { align: 'right' });
      doc.text('Ihre Kundennummer', 130, invoiceTopY + 25);
      doc.text(finalMeta.customerNumber || '-', 194, invoiceTopY + 25, { align: 'right' });
      doc.text('Ihr Ansprechpartner', 130, invoiceTopY + 32);
      doc.text(finalMeta.contactPerson || '-', 194, invoiceTopY + 32, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(`Rechnung Nr. ${finalMeta.invoiceNumber || '-'}`, 20, 107);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text('Sehr geehrte Damen und Herren,', 20, 117);
      doc.text('vielen Dank für Ihre Aufträge und das damit verbundene Vertrauen.', 20, 125);
      doc.text('Hiermit stellen wir Ihnen die folgenden Leistungen in Rechnung:', 20, 131);

      autoTable(doc, {
        startY: 136,
        margin: { left: 20, right: 20 },
        head: [['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Gesamtpreis']],
        body: rows.map((row, index) => {
          const orderPrice = parseMoneyInput(row.orderPriceDraft);
          const fuelExpenses = parseMoneyInput(row.fuelExpensesDraft);
          const lineTotal = orderPrice + fuelExpenses;
          const description = `${row.orderNumber} ${row.routeDraft}`.trim();
          return [
            String(index + 1),
            description,
            'pauschal',
            formatEuroText(lineTotal),
            formatEuroText(lineTotal),
          ];
        }),
        styles: {
          fontSize: 9,
          cellPadding: 2.6,
          overflow: 'linebreak',
          textColor: [30, 41, 59],
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [229, 231, 235],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 95 },
          2: { cellWidth: 24, halign: 'center' },
          3: { cellWidth: 26, halign: 'right' },
          4: { cellWidth: 26, halign: 'right' },
        },
      });

      let y = (doc.lastAutoTable?.finalY || 136) + 8;
      if (y > 235) {
        doc.addPage();
        y = 24;
      }

      const summaryX = 110;
      const summaryWidth = 84;
      const lineHeight = 8;
      const drawSummaryLine = (label, value, top, bold = false, shaded = false) => {
        if (shaded) {
          doc.setFillColor(241, 245, 249);
          doc.rect(summaryX, top - 5.2, summaryWidth, 7.2, 'F');
        }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10.5);
        doc.text(label, summaryX + 2, top);
        doc.text(value, summaryX + summaryWidth - 2, top, { align: 'right' });
      };

      drawSummaryLine('Gesamtbetrag netto', formatEuroText(summary.net), y, false, true);
      drawSummaryLine(`Umsatzsteuer ${summary.vatRate || 0}%`, formatEuroText(summary.vatAmount), y + lineHeight, false, false);
      drawSummaryLine('Gesamtbetrag brutto', formatEuroText(summary.gross), y + lineHeight * 2, true, true);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const paymentY = y + lineHeight * 2 + 12;
      doc.text(
        `Zahlungsbedingungen: Zahlung innerhalb von ${finalMeta.paymentDays || 14} Tagen ab Rechnungseingang ohne Abzüge.`,
        20,
        paymentY
      );
      doc.text('Mit freundlichen Grüßen', 20, paymentY + 11);
      doc.text(`Team ${issuer.name}`, 20, paymentY + 18);

      const totalPages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(212, 212, 212);
        doc.line(20, 270, 190, 270);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);

        const leftBlock = [issuer.name, issuer.street, `${issuer.postalCode} ${issuer.city}`, issuer.country];
        const midLeftBlock = [`Tel.: ${issuer.phone}`, `E-Mail: ${issuer.email}`, `Web: ${issuer.web}`];
        const midRightBlock = [`USt.-ID: ${issuer.vatId}`, `Steuer-Nr.: ${issuer.taxNumber}`, `Inhaber/-in: ${issuer.owner}`];
        const rightBlock = [issuer.bankName, `IBAN: ${issuer.iban}`, `BIC: ${issuer.bic}`];

        leftBlock.forEach((line, idx) => doc.text(line, 20, 276 + idx * 5));
        midLeftBlock.forEach((line, idx) => doc.text(line, 66, 276 + idx * 5));
        midRightBlock.forEach((line, idx) => doc.text(line, 112, 276 + idx * 5));
        rightBlock.forEach((line, idx) => doc.text(line, 154, 276 + idx * 5));

        doc.text(`Seite ${page} von ${totalPages}`, 190, 266, { align: 'right' });
      }

      const customerSafe = sanitizeFileNamePart(getCustomerName(record), 32) || 'Kunde';
      const stamp = format(new Date(), 'yyyyMMdd_HHmm');
      doc.save(`Rechnung_${customerSafe}_${stamp}.pdf`);
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

  return (
    <div className="space-y-4">
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
              {!isInvoice ? (
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={saving || finalizing}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Entwurf speichern
                </Button>
              ) : null}
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Positionen</p>
              <p className="font-semibold text-slate-900">{summary.orderCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Netto</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.net)}</p>
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
                  <th className="px-3 py-2">Auftragsnummer</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Beschreibung / Route</th>
                  <th className="px-3 py-2">Fahrzeug</th>
                  <th className="px-3 py-2">Kennzeichen</th>
                  <th className="px-3 py-2 text-right">Auftragspreis</th>
                  <th className="px-3 py-2 text-right">Auslagen (Tank)</th>
                  <th className="px-3 py-2 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const orderPrice = parseMoneyInput(row.orderPriceDraft);
                  const fuelExpenses = parseMoneyInput(row.fuelExpensesDraft);
                  const total = orderPrice + fuelExpenses;
                  return (
                    <tr key={row.id} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="px-3 py-2">{row.orderNumber}</td>
                      <td className="px-3 py-2">{row.dateLabel}</td>
                      <td className="min-w-[300px] px-3 py-2">
                        <Textarea
                          value={row.routeDraft}
                          onChange={(event) => handleRowChange(row.id, 'routeDraft', event.target.value)}
                          rows={2}
                        />
                      </td>
                      <td className="px-3 py-2">{row.vehicle}</td>
                      <td className="px-3 py-2">{row.plate}</td>
                      <td className="min-w-[140px] px-3 py-2">
                        <Input
                          value={row.orderPriceDraft}
                          onChange={(event) => handleRowChange(row.id, 'orderPriceDraft', event.target.value)}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="min-w-[140px] px-3 py-2">
                        <Input
                          value={row.fuelExpensesDraft}
                          onChange={(event) => handleRowChange(row.id, 'fuelExpensesDraft', event.target.value)}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrencyValue(total)}</td>
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
