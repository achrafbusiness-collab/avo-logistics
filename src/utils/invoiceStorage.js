const DRAFTS_KEY = 'avo:finance:invoice-drafts:v1';
const INVOICES_KEY = 'avo:finance:invoices:v1';
const SETTINGS_KEY = 'avo:finance:settings:v1';

const DEFAULT_FINANCE_SETTINGS = {
  invoicePrefix: 'AV',
  defaultVatRate: 19,
  defaultPaymentDays: 14,
  nextInvoiceNumber: 1000,
  invoiceProfile: {
    companyName: 'AVO LOGISTICS',
    companySuffix: '',
    owner: 'Achraf Bolakhrif',
    legalForm: '',
    street: 'Collenbachstraße 1',
    postalCode: '40476',
    city: 'Düsseldorf',
    country: 'Deutschland',
    phone: '+49 17624273014',
    fax: '',
    email: 'info@avo-logistics.de',
    website: 'www.avo-logistics.de',
    taxNumber: '10350222746',
    vatId: 'DE361070222',
    bankName: 'Stadtsparkasse Düsseldorf',
    accountNumber: '',
    blz: '',
    iban: 'DE98 3005 0110 1009 0619 02',
    bic: 'DUSSDEDDXXX',
    defaultContactPerson: 'Achraf Bolakhrif',
    paymentTerms: 'Zahlung innerhalb von {days} Tagen ab Rechnungseingang ohne Abzüge.',
    logoDataUrl: '',
  },
};

const readJson = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

export const listInvoiceDrafts = () => {
  const drafts = normalizeArray(readJson(DRAFTS_KEY, []));
  return drafts.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
};

export const getInvoiceDraft = (draftId) => {
  if (!draftId) return null;
  return listInvoiceDrafts().find((draft) => draft.id === draftId) || null;
};

export const upsertInvoiceDraft = (draft) => {
  if (!draft?.id) return null;
  const drafts = listInvoiceDrafts();
  const now = new Date().toISOString();
  const payload = {
    ...draft,
    rows: normalizeArray(draft.rows),
    updatedAt: now,
    createdAt: draft.createdAt || now,
  };
  const index = drafts.findIndex((entry) => entry.id === draft.id);
  if (index >= 0) {
    drafts[index] = payload;
  } else {
    drafts.unshift(payload);
  }
  writeJson(DRAFTS_KEY, drafts);
  return payload;
};

export const deleteInvoiceDraft = (draftId) => {
  if (!draftId) return;
  const drafts = listInvoiceDrafts().filter((draft) => draft.id !== draftId);
  writeJson(DRAFTS_KEY, drafts);
};

export const listInvoices = () => {
  const invoices = normalizeArray(readJson(INVOICES_KEY, []));
  return invoices.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
};

export const getInvoice = (invoiceId) => {
  if (!invoiceId) return null;
  return listInvoices().find((invoice) => invoice.id === invoiceId) || null;
};

export const upsertInvoice = (invoice) => {
  if (!invoice?.id) return null;
  const invoices = listInvoices();
  const now = new Date().toISOString();
  const payload = {
    ...invoice,
    rows: normalizeArray(invoice.rows),
    updatedAt: now,
    createdAt: invoice.createdAt || now,
  };
  const index = invoices.findIndex((entry) => entry.id === invoice.id);
  if (index >= 0) {
    invoices[index] = payload;
  } else {
    invoices.unshift(payload);
  }
  writeJson(INVOICES_KEY, invoices);
  return payload;
};

export const updateInvoiceStatus = (invoiceId, status, options = {}) => {
  if (!invoiceId) return null;
  const invoices = listInvoices();
  const index = invoices.findIndex((invoice) => invoice.id === invoiceId);
  if (index < 0) return null;
  const current = invoices[index] || {};
  const nextStatus = status || current.status || 'open';
  const hasPaidAtOverride = Object.prototype.hasOwnProperty.call(options, 'paidAt');
  const overridePaidAt = hasPaidAtOverride ? String(options.paidAt || '').trim() : '';
  let paidAt = String(current.paidAt || '').trim();
  if (nextStatus === 'paid') {
    if (hasPaidAtOverride) {
      paidAt = overridePaidAt || new Date().toISOString();
    } else if (!paidAt) {
      paidAt = new Date().toISOString();
    }
  } else {
    paidAt = '';
  }
  invoices[index] = {
    ...current,
    status: nextStatus,
    paidAt,
    updatedAt: new Date().toISOString(),
  };
  writeJson(INVOICES_KEY, invoices);
  return invoices[index];
};

export const deleteInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const invoices = listInvoices().filter((invoice) => invoice.id !== invoiceId);
  writeJson(INVOICES_KEY, invoices);
};

export const finalizeDraftToInvoice = (draftId, data = {}) => {
  const draft = getInvoiceDraft(draftId);
  if (!draft) return null;
  const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const invoice = upsertInvoice({
    ...draft,
    ...data,
    id: invoiceId,
    sourceDraftId: draft.id,
    finalizedAt: now,
    status: data.status || 'open',
  });
  deleteInvoiceDraft(draftId);
  return invoice;
};

export const getFinanceSettings = () => {
  const raw = readJson(SETTINGS_KEY, {});
  return {
    ...DEFAULT_FINANCE_SETTINGS,
    ...raw,
    invoiceProfile: {
      ...DEFAULT_FINANCE_SETTINGS.invoiceProfile,
      ...(raw?.invoiceProfile || {}),
    },
  };
};

export const saveFinanceSettings = (settings) => {
  const payload = {
    ...getFinanceSettings(),
    ...settings,
  };
  writeJson(SETTINGS_KEY, payload);
  return payload;
};

export const consumeNextInvoiceNumber = () => {
  const settings = getFinanceSettings();
  const current = Number.parseInt(settings.nextInvoiceNumber, 10);
  const value = Number.isFinite(current) ? current : 1000;
  const next = value + 1;
  saveFinanceSettings({ nextInvoiceNumber: next });
  return value;
};
