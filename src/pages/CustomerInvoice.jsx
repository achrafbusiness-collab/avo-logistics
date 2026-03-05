import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, Loader2, TriangleAlert } from 'lucide-react';

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

const sanitizeFileNamePart = (value, maxLength = 60) => {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
};

export default function CustomerInvoice() {
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft') || '';
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const draft = useMemo(() => {
    if (!draftId || typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(`avo:customer-invoice-draft:${draftId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }, [draftId]);

  const initialRows = useMemo(() => {
    if (!draft?.rows || !Array.isArray(draft.rows)) return [];
    return draft.rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber || '-',
      dateLabel: row.dateLabel || '-',
      routeDraft: row.route || '-',
      vehicle: row.vehicle || '-',
      plate: row.plate || '-',
      orderPriceDraft: toMoneyInput(row.orderPrice),
      fuelExpensesDraft: toMoneyInput(row.fuelExpenses),
    }));
  }, [draft]);

  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const summary = useMemo(() => {
    const orderTotal = rows.reduce(
      (sum, row) => sum + parseMoneyInput(row.orderPriceDraft),
      0
    );
    const fuelTotal = rows.reduce(
      (sum, row) => sum + parseMoneyInput(row.fuelExpensesDraft),
      0
    );
    return {
      orderCount: rows.length,
      orderTotal,
      fuelTotal,
      grandTotal: orderTotal + fuelTotal,
    };
  }, [rows]);

  const handleRowChange = (rowId, field, value) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const downloadInvoicePdf = async () => {
    if (!rows.length) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(15);
      doc.text('Rechnung', 40, 36);
      doc.setFontSize(10);
      doc.text(`Kunde: ${draft?.customerLabel || 'Kunde'}`, 40, 56);
      doc.text(
        `Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })}`,
        40,
        72
      );
      doc.text(`Anzahl Auftraege: ${summary.orderCount}`, 320, 56);
      doc.text(`Gesamtbetrag Auftraege: ${formatCurrencyValue(summary.orderTotal)}`, 320, 72);
      doc.text(`Gesamtbetrag Tank/Auslagen: ${formatCurrencyValue(summary.fuelTotal)}`, 610, 56);
      doc.text(`Gesamtsumme: ${formatCurrencyValue(summary.grandTotal)}`, 610, 72);

      autoTable(doc, {
        startY: 88,
        head: [['Auftragsnr.', 'Datum', 'Route', 'Fahrzeug', 'Kennzeichen', 'Auftragspreis', 'Auslagen (Tank)', 'Gesamt']],
        body: rows.map((row) => {
          const orderPrice = parseMoneyInput(row.orderPriceDraft);
          const fuelExpenses = parseMoneyInput(row.fuelExpensesDraft);
          return [
            row.orderNumber,
            row.dateLabel,
            row.routeDraft,
            row.vehicle,
            row.plate,
            formatCurrencyValue(orderPrice),
            formatCurrencyValue(fuelExpenses),
            formatCurrencyValue(orderPrice + fuelExpenses),
          ];
        }),
        foot: [[
          'SUMME',
          '',
          '',
          '',
          '',
          formatCurrencyValue(summary.orderTotal),
          formatCurrencyValue(summary.fuelTotal),
          formatCurrencyValue(summary.grandTotal),
        ]],
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 58, 95] },
        footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 72 },
          1: { cellWidth: 58 },
          2: { cellWidth: 250 },
          3: { cellWidth: 95 },
          4: { cellWidth: 70 },
          5: { cellWidth: 80, halign: 'right' },
          6: { cellWidth: 90, halign: 'right' },
          7: { cellWidth: 80, halign: 'right' },
        },
      });

      const customerSafe =
        sanitizeFileNamePart(draft?.customerLabel || 'Kunde', 32) || 'Kunde';
      const stamp = format(new Date(), 'yyyyMMdd_HHmm');
      doc.save(`Rechnung_${customerSafe}_${stamp}.pdf`);
    } catch (error) {
      setDownloadError(error?.message || 'PDF-Download fehlgeschlagen.');
    } finally {
      setDownloading(false);
    }
  };

  if (!draft || !rows.length) {
    return (
      <div className="space-y-4">
        <Card className="border border-amber-200 bg-amber-50">
          <CardContent className="py-8 text-center">
            <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-amber-600" />
            <p className="font-medium text-amber-900">Rechnungsentwurf nicht gefunden</p>
            <p className="mt-1 text-sm text-amber-800">
              Bitte öffne die Rechnung erneut über „Mit Kunden abrechnen“.
            </p>
          </CardContent>
        </Card>
        <Link to={createPageUrl('Orders')}>
          <Button variant="outline">Zurück zu Aufträgen</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Rechnung</CardTitle>
              <p className="text-sm text-slate-500">
                Kunde: <span className="font-medium text-slate-900">{draft.customerLabel || 'Kunde'}</span>
              </p>
            </div>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={downloadInvoicePdf}
              disabled={downloading || rows.length === 0}
            >
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Rechnung als PDF herunterladen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Aufträge</p>
              <p className="font-semibold text-slate-900">{summary.orderCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Gesamt Aufträge</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.orderTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Gesamt Tank</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(summary.fuelTotal)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
              <p className="text-xs text-emerald-700">Gesamtsumme</p>
              <p className="font-semibold text-emerald-900">{formatCurrencyValue(summary.grandTotal)}</p>
            </div>
          </div>

          <div className="mt-4 max-h-[62vh] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Auftragsnummer</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Fahrzeug</th>
                  <th className="px-3 py-2">Kennzeichen</th>
                  <th className="px-3 py-2 text-right">Auftragspreis</th>
                  <th className="px-3 py-2 text-right">Auslagen (Tank)</th>
                  <th className="px-3 py-2 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const orderPrice = parseMoneyInput(row.orderPriceDraft);
                  const fuelExpenses = parseMoneyInput(row.fuelExpensesDraft);
                  const total = orderPrice + fuelExpenses;
                  return (
                    <tr key={row.id} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-2">{row.orderNumber}</td>
                      <td className="px-3 py-2">{row.dateLabel}</td>
                      <td className="min-w-[280px] px-3 py-2">
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
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-300 font-semibold text-slate-900">
                  <td className="px-3 py-2">SUMME</td>
                  <td className="px-3 py-2" colSpan={4}></td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(summary.orderTotal)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(summary.fuelTotal)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(summary.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {downloadError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {downloadError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
