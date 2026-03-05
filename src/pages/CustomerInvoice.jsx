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
      customerNumber: meta.customerNumber || record?.customer?.customer_number || '',
      contactPerson: meta.contactPerson || defaultContact,
      paymentDays: String(meta.paymentDays || financeDefaults.defaultPaymentDays || 14),
      vatRate: String(meta.vatRate ?? financeDefaults.defaultVatRate ?? 19),
      includeFuel: meta.includeFuel !== false,
    });
  }, [
    record,
    currentUser,
    latestDeliveryDate,
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
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const finalMeta = {
        ...invoiceMeta,
        invoiceNumber: invoiceMeta.invoiceNumber || (isInvoice ? '-' : buildInvoiceNumber()),
      };
      const toDisplayDate = (value) => {
        if (!value) return '-';
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
          const parsed = new Date(`${value}T12:00:00`);
          if (!Number.isNaN(parsed.getTime())) {
            return format(parsed, 'dd.MM.yyyy', { locale: de });
          }
        }
        return String(value);
      };

      const logoDataUrl = issuer.logoDataUrl || (await loadImageAsDataUrl('/logo.png'));
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const contentWidth = pageWidth - marginX * 2;
      const footerTop = pageHeight - 31;
      const getImageFormat = (dataUrl) => {
        const raw = String(dataUrl || '').toLowerCase();
        if (raw.startsWith('data:image/jpeg') || raw.startsWith('data:image/jpg')) return 'JPEG';
        return 'PNG';
      };

      doc.setFont('helvetica', 'normal');
      if (logoDataUrl) {
        try {
          doc.addImage(
            logoDataUrl,
            getImageFormat(logoDataUrl),
            pageWidth - marginX - 38,
            10,
            38,
            16
          );
        } catch (error) {
          doc.setFontSize(16);
          doc.text(issuer.name, pageWidth - marginX, 18, { align: 'right' });
        }
      } else {
        doc.setFontSize(16);
        doc.text(issuer.name, pageWidth - marginX, 18, { align: 'right' });
      }

      doc.setFillColor(30, 58, 95);
      doc.rect(marginX, 8, contentWidth, 1.3, 'F');

      doc.setFontSize(8.5);
      const companyHeader = [issuer.name, issuer.companySuffix].filter(Boolean).join(' ');
      doc.text(
        `${companyHeader} - ${issuer.street} - ${issuer.postalCode} ${issuer.city}`,
        marginX,
        35
      );

      const customerLines = getCustomerAddressLines(record);
      const customerExtraLines = [
        record?.customer?.email ? `E-Mail: ${record.customer.email}` : '',
        record?.customer?.phone ? `Telefon: ${record.customer.phone}` : '',
      ].filter(Boolean);
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, 41, 86, 38, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, 41, 86, 38, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('Rechnung an', marginX + 2, 46.5);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      customerLines.forEach((line, index) => {
        doc.text(line, marginX + 2, 53 + index * 5.2);
      });
      doc.setFontSize(9);
      customerExtraLines.forEach((line, index) => {
        doc.text(line, marginX + 2, 68 + index * 4.6);
      });

      const invoiceTopY = 48;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Rechnungs-Nr.', 130, invoiceTopY);
      doc.text(finalMeta.invoiceNumber || '-', pageWidth - marginX, invoiceTopY, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Rechnungsdatum', 130, invoiceTopY + 8);
      doc.text(toDisplayDate(finalMeta.invoiceDate), pageWidth - marginX, invoiceTopY + 8, { align: 'right' });
      doc.text('Lieferdatum', 130, invoiceTopY + 15);
      doc.text(toDisplayDate(finalMeta.deliveryDate), pageWidth - marginX, invoiceTopY + 15, { align: 'right' });
      doc.text('Ihre Kundennummer', 130, invoiceTopY + 25);
      doc.text(finalMeta.customerNumber || '-', pageWidth - marginX, invoiceTopY + 25, { align: 'right' });
      doc.text('Ihr Ansprechpartner', 130, invoiceTopY + 32);
      doc.text(finalMeta.contactPerson || '-', pageWidth - marginX, invoiceTopY + 32, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(`Rechnung Nr. ${finalMeta.invoiceNumber || '-'}`, marginX, 98);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text('Sehr geehrte Damen und Herren,', marginX, 108);
      doc.text('vielen Dank für Ihre Aufträge und das damit verbundene Vertrauen.', marginX, 116);
      doc.text('Hiermit stellen wir Ihnen die folgenden Leistungen in Rechnung:', marginX, 122);

      autoTable(doc, {
        startY: 126,
        margin: { left: marginX, right: marginX, bottom: 42 },
        head: [['Pos.', 'Beschreibung', 'Tour Netto', 'Tank Netto', 'Gesamt Netto']],
        body: rows.map((row, index) => {
          const orderNet = parseMoneyInput(row.orderPriceDraft);
          const fuelGrossRaw = parseMoneyInput(row.fuelExpensesDraft);
          const fuelGross = finalMeta.includeFuel === false ? 0 : fuelGrossRaw;
          const fuelNet = grossToNet(fuelGross, summary.vatRate);
          const lineNet = orderNet + fuelNet;
          const description = `${row.orderNumber} ${row.routeDraft}`.trim();
          return [
            String(index + 1),
            description,
            formatEuroText(orderNet),
            formatEuroText(fuelNet),
            formatEuroText(lineNet),
          ];
        }),
        styles: {
          fontSize: 8.6,
          cellPadding: 2.4,
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
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 92 },
          2: { cellWidth: 26, halign: 'right' },
          3: { cellWidth: 26, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
        },
      });

      const paymentTermsText = String(issuer.paymentTerms || DEFAULT_ISSUER.paymentTerms).replace(
        '{days}',
        String(finalMeta.paymentDays || 14)
      );
      const paymentTermsLines = doc.splitTextToSize(`Zahlungsbedingungen: ${paymentTermsText}`, contentWidth);

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 126) + 4,
        margin: { left: marginX + 84, right: marginX, bottom: 42 },
        tableWidth: contentWidth - 84,
        theme: 'grid',
        body: [
          ['Gesamtauftragspreise (Netto)', formatEuroText(summary.orderNet)],
          ['Nettobetrag Auslagen (Tank)', formatEuroText(summary.fuelNet)],
          ['Gesamter Nettobetrag', formatEuroText(summary.net)],
          [`Umsatzsteuer ${summary.vatRate || 0}%`, formatEuroText(summary.vatAmount)],
          ['Gesamter Bruttobetrag', formatEuroText(summary.gross)],
        ],
        styles: {
          fontSize: 9.2,
          cellPadding: 2.2,
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
        },
        columnStyles: {
          0: { cellWidth: 52 },
          1: { cellWidth: 32, halign: 'right' },
        },
        didParseCell: (hook) => {
          if (hook.row.section === 'body' && hook.row.index === 4) {
            hook.cell.styles.fontStyle = 'bold';
          }
          if (hook.row.section === 'body' && (hook.row.index === 0 || hook.row.index === 4)) {
            hook.cell.styles.fillColor = [241, 245, 249];
          }
        },
      });

      let paymentY = (doc.lastAutoTable?.finalY || 126) + 10;
      const paymentBlockHeight = paymentTermsLines.length * 5 + 14;
      if (paymentY + paymentBlockHeight > footerTop - 2) {
        doc.addPage();
        paymentY = 20;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.text(paymentTermsLines, marginX, paymentY);
      const signatureY = paymentY + paymentTermsLines.length * 5 + 6;
      doc.text('Mit freundlichen Grüßen', marginX, signatureY);
      doc.text(`Team ${issuer.name}`, marginX, signatureY + 6);

      const totalPages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(212, 212, 212);
        doc.line(marginX, footerTop - 2, pageWidth - marginX, footerTop - 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.1);

        const footerCompanyName = [issuer.name, issuer.companySuffix].filter(Boolean).join(' ');
        const leftBlockRaw = [
          footerCompanyName,
          [issuer.owner, issuer.legalForm].filter(Boolean).join(' • '),
          issuer.street,
          `${issuer.postalCode} ${issuer.city}`,
          issuer.country,
        ];
        const midLeftBlockRaw = [
          `Tel.: ${issuer.phone || '-'}`,
          `FAX: ${issuer.fax || '-'}`,
          `E-Mail: ${issuer.email || '-'}`,
          `Web: ${issuer.web || '-'}`,
        ];
        const midRightBlockRaw = [
          `Steuer-Nr.: ${issuer.taxNumber || '-'}`,
          `USt.-ID: ${issuer.vatId || '-'}`,
        ];
        const rightBlockRaw = [
          issuer.bankName || '-',
          `Kontonummer: ${issuer.accountNumber || '-'}`,
          `BLZ: ${issuer.blz || '-'}`,
          `IBAN: ${issuer.iban || '-'}`,
          `BIC: ${issuer.bic || '-'}`,
        ];
        const colGap = 2;
        const colWidth = (contentWidth - colGap * 3) / 4;
        const colX = [
          marginX,
          marginX + colWidth + colGap,
          marginX + (colWidth + colGap) * 2,
          marginX + (colWidth + colGap) * 3,
        ];
        const drawFooterColumn = (x, lines) => {
          const maxLines = 5;
          const result = [];
          lines
            .filter(Boolean)
            .forEach((line) => {
              const wrapped = doc.splitTextToSize(String(line), colWidth);
              wrapped.forEach((item) => {
                if (result.length < maxLines) result.push(item);
              });
            });
          result.forEach((line, idx) => doc.text(line, x, footerTop + idx * 4.3));
        };
        drawFooterColumn(colX[0], leftBlockRaw);
        drawFooterColumn(colX[1], midLeftBlockRaw);
        drawFooterColumn(colX[2], midRightBlockRaw);
        drawFooterColumn(colX[3], rightBlockRaw);

        doc.text(`Seite ${page} von ${totalPages}`, pageWidth - marginX, footerTop - 4.5, { align: 'right' });
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
                  <th className="px-3 py-2">Auftragsnummer</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Beschreibung / Route</th>
                  <th className="px-3 py-2">Fahrzeug</th>
                  <th className="px-3 py-2">Kennzeichen</th>
                  <th className="px-3 py-2 text-right">Auftragspreis (Netto)</th>
                  <th className="px-3 py-2 text-right">Tank (Brutto)</th>
                  <th className="px-3 py-2 text-right">Tank (Netto)</th>
                  <th className="px-3 py-2 text-right">Rechnung Netto</th>
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
                          disabled={invoiceMeta.includeFuel === false}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrencyValue(fuelNet)}</td>
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
