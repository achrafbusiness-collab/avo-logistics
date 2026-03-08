import { format } from 'date-fns';
import { de } from 'date-fns/locale';

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

export const buildCustomerInvoicePdf = async ({
  record,
  rows = [],
  invoiceMeta = {},
  issuer = {},
  customerOverride = null,
}) => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const finalMeta = {
    ...invoiceMeta,
    invoiceNumber: invoiceMeta?.invoiceNumber || '-',
  };
  const vatRate = parseMoneyInput(finalMeta.vatRate);
  const includeFuel = finalMeta.includeFuel !== false;
  const summary = {
    vatRate,
    orderNet: rows.reduce((sum, row) => sum + parseMoneyInput(row.orderPriceDraft ?? row.orderPrice), 0),
    fuelNet: rows.reduce((sum, row) => {
      const grossFuel = includeFuel ? parseMoneyInput(row.fuelExpensesDraft ?? row.fuelExpenses) : 0;
      return sum + grossToNet(grossFuel, vatRate);
    }, 0),
  };
  summary.net = summary.orderNet + summary.fuelNet;
  summary.vatAmount = summary.net * (vatRate / 100);
  summary.gross = summary.net + summary.vatAmount;

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
  const logoBox = { x: pageWidth - marginX - 64, y: 7, w: 64, h: 24 };
  const fontSizes = {
    title: 16,
    body: 10,
    tableHead: 10,
    tableBody: 10,
    totals: 11,
    footer: 9,
  };

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(255, 255, 255);
  doc.rect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 'F');
  if (logoDataUrl) {
    try {
      const imageFormat = getImageFormat(logoDataUrl);
      const properties = doc.getImageProperties(logoDataUrl);
      const maxW = logoBox.w - 2;
      const maxH = logoBox.h - 2;
      const imgRatio = properties.width / properties.height;
      let drawW = maxW;
      let drawH = drawW / imgRatio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * imgRatio;
      }
      const drawX = logoBox.x + (logoBox.w - drawW) / 2;
      const drawY = logoBox.y + (logoBox.h - drawH) / 2;
      doc.addImage(logoDataUrl, imageFormat, drawX, drawY, drawW, drawH, undefined, 'FAST');
    } catch (error) {
      doc.setFontSize(16);
      doc.text(issuer.name || '-', pageWidth - marginX, 18, { align: 'right' });
    }
  } else {
    doc.setFontSize(16);
    doc.text(issuer.name || '-', pageWidth - marginX, 18, { align: 'right' });
  }

  doc.setFillColor(30, 58, 95);
  doc.rect(marginX, 35, contentWidth, 1.2, 'F');

  const customerLines = getCustomerAddressLines(record, customerOverride).slice(0, 6);
  const mergedCustomer = mergeCustomerData(record, customerOverride);
  const customerExtraLines = [
    mergedCustomer?.tax_id ? `Steuer-ID: ${mergedCustomer.tax_id}` : '',
    mergedCustomer?.email ? `E-Mail: ${mergedCustomer.email}` : '',
    mergedCustomer?.phone ? `Telefon: ${mergedCustomer.phone}` : '',
  ].filter(Boolean);
  const customerBoxY = 46;
  const customerBoxHeight = Math.min(
    52,
    Math.max(36, 14 + customerLines.length * 5.2 + customerExtraLines.length * 4.6)
  );
  const customerNameStartY = customerBoxY + 12;
  const customerExtraStartY = customerNameStartY + customerLines.length * 5.2 + 0.8;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, customerBoxY, 86, customerBoxHeight, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginX, customerBoxY, 86, customerBoxHeight, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSizes.body);
  doc.text('Rechnung an', marginX + 2, customerBoxY + 5.5);
  doc.setFontSize(fontSizes.body);
  doc.setFont('helvetica', 'normal');
  customerLines.forEach((line, index) => {
    doc.text(line, marginX + 2, customerNameStartY + index * 5.2);
  });
  doc.setFontSize(fontSizes.body);
  customerExtraLines.forEach((line, index) => {
    doc.text(line, marginX + 2, customerExtraStartY + index * 4.6);
  });

  const invoiceTopY = 48;
  doc.setFontSize(fontSizes.body);
  doc.setFont('helvetica', 'bold');
  doc.text('Rechnungs-Nr.', 130, invoiceTopY);
  doc.text(finalMeta.invoiceNumber || '-', pageWidth - marginX, invoiceTopY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSizes.body);
  doc.text('Rechnungsdatum', 130, invoiceTopY + 8);
  doc.text(toDisplayDate(finalMeta.invoiceDate), pageWidth - marginX, invoiceTopY + 8, { align: 'right' });
  doc.text('Lieferdatum', 130, invoiceTopY + 15);
  doc.text(toDisplayDate(finalMeta.deliveryDate), pageWidth - marginX, invoiceTopY + 15, { align: 'right' });
  doc.text('Ihre Kundennummer', 130, invoiceTopY + 25);
  doc.text(finalMeta.customerNumber || '-', pageWidth - marginX, invoiceTopY + 25, { align: 'right' });
  doc.text('Ihr Ansprechpartner', 130, invoiceTopY + 32);
  doc.text(finalMeta.contactPerson || '-', pageWidth - marginX, invoiceTopY + 32, { align: 'right' });

  const introTitleY = Math.max(98, customerBoxY + customerBoxHeight + 11);
  const greetingY = introTitleY + 10;
  const thanksY = greetingY + 8;
  const leadInY = thanksY + 6;
  const tableStartY = leadInY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSizes.title);
  doc.text(`Rechnung Nr. ${finalMeta.invoiceNumber || '-'}`, marginX, introTitleY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSizes.body);
  doc.text('Sehr geehrte Damen und Herren,', marginX, greetingY);
  doc.text('vielen Dank für Ihre Aufträge und das damit verbundene Vertrauen.', marginX, thanksY);
  doc.text('Hiermit stellen wir Ihnen die folgenden Leistungen in Rechnung:', marginX, leadInY);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX, right: marginX, bottom: 42 },
    head: [['Pos.', 'Datum', 'Kennzeichen', 'Abholadresse', 'Lieferadresse', 'Auftragspreis', 'Betankung (Netto)', 'Gesamtpreis']],
    body: rows.map((row, index) => {
      const fallbackAddresses = splitRouteToAddresses(row.routeDraft || row.route);
      const pickupAddress = (row.pickupAddress || row.pickup_address || fallbackAddresses.pickupAddress || '-').trim();
      const dropoffAddress = (row.dropoffAddress || row.dropoff_address || fallbackAddresses.dropoffAddress || '-').trim();
      const dateLabel = String(row.dateLabel || '-').trim() || '-';
      const plateLabel = String(row.plate || row.license_plate || '-').trim() || '-';
      const orderNet = parseMoneyInput(row.orderPriceDraft ?? row.orderPrice);
      const fuelGrossRaw = parseMoneyInput(row.fuelExpensesDraft ?? row.fuelExpenses);
      const fuelGross = finalMeta.includeFuel === false ? 0 : fuelGrossRaw;
      const fuelNet = grossToNet(fuelGross, summary.vatRate);
      const lineNet = orderNet + fuelNet;
      return [
        String(index + 1),
        dateLabel,
        plateLabel,
        pickupAddress || '-',
        dropoffAddress || '-',
        formatEuroText(orderNet),
        formatEuroText(fuelNet),
        formatEuroText(lineNet),
      ];
    }),
    styles: {
      fontSize: fontSizes.tableBody,
      cellPadding: 1.2,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [229, 231, 235],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 1.1,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 23, halign: 'center' },
      3: { cellWidth: 27 },
      4: { cellWidth: 27 },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
  });

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
      fontSize: fontSizes.totals,
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

  const paymentTermsText = String(issuer.paymentTerms || '').replace(
    '{days}',
    String(finalMeta.paymentDays || 14)
  );
  const paymentTermsLines = doc.splitTextToSize(`Zahlungsbedingungen: ${paymentTermsText}`, contentWidth);

  let paymentY = (doc.lastAutoTable?.finalY || 126) + 10;
  const paymentBlockHeight = paymentTermsLines.length * 5 + 14;
  if (paymentY + paymentBlockHeight > footerTop - 2) {
    doc.addPage();
    paymentY = 20;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSizes.body);
  doc.text(paymentTermsLines, marginX, paymentY);
  const signatureY = paymentY + paymentTermsLines.length * 5 + 6;
  doc.text('Mit freundlichen Grüßen', marginX, signatureY);
  doc.text(`Team ${issuer.name || ''}`, marginX, signatureY + 6);

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const footerAreaY = footerTop - 6;
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, footerAreaY, contentWidth, pageHeight - footerAreaY - 8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSizes.footer);
    doc.setTextColor(51, 65, 85);

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
      result.forEach((line, idx) => doc.text(line, x, footerAreaY + 8 + idx * 4.1));
    };
    drawFooterColumn(colX[0], leftBlockRaw);
    drawFooterColumn(colX[1], midLeftBlockRaw);
    drawFooterColumn(colX[2], midRightBlockRaw);
    drawFooterColumn(colX[3], rightBlockRaw);

    doc.text(`${page}/${totalPages}`, pageWidth - marginX, footerAreaY + 4.2, { align: 'right' });
  }

  const customerSafe = sanitizeFileNamePart(getCustomerName(record, customerOverride), 32) || 'Kunde';
  const stamp = format(new Date(), 'yyyyMMdd_HHmm');
  const fileName = `Rechnung_${customerSafe}_${stamp}.pdf`;
  const arrayBuffer = doc.output('arraybuffer');
  return { arrayBuffer, fileName };
};
