const DRAFTS_KEY = 'tf:finance:invoice-drafts:v1';
const INVOICES_KEY = 'tf:finance:invoices:v1';
const SETTINGS_KEY = 'tf:finance:settings:v1';
const TRASH_KEY = 'tf:finance:invoice-trash:v1';
const TRASH_RETENTION_DAYS = 14;

// --- Company-scoped localStorage ---
let _activeCompanyId = null;

export const setActiveCompanyId = (id) => {
  _activeCompanyId = id || null;
};

export const getActiveCompanyId = () => _activeCompanyId;

const scopedKey = (baseKey) => {
  if (_activeCompanyId) return `${baseKey}:${_activeCompanyId}`;
  return baseKey;
};

// Migrate unscoped data to company-scoped key (one-time per company)
const migrateToScoped = (baseKey) => {
  if (typeof window === 'undefined' || !_activeCompanyId) return;
  const scoped = `${baseKey}:${_activeCompanyId}`;
  if (!window.localStorage.getItem(scoped)) {
    const old = window.localStorage.getItem(baseKey);
    if (old) {
      window.localStorage.setItem(scoped, old);
    }
  }
};

// Migrate data from old avo: keys to new tf: keys (one-time)
if (typeof window !== 'undefined') {
  const migrations = [
    ['avo:finance:invoice-drafts:v1', DRAFTS_KEY],
    ['avo:finance:invoices:v1', INVOICES_KEY],
    ['avo:finance:settings:v1', SETTINGS_KEY],
  ];
  for (const [oldKey, newKey] of migrations) {
    const oldData = window.localStorage.getItem(oldKey);
    if (oldData && !window.localStorage.getItem(newKey)) {
      window.localStorage.setItem(newKey, oldData);
    }
    if (oldData) {
      window.localStorage.removeItem(oldKey);
    }
  }
}

const DEFAULT_FINANCE_SETTINGS = {
  invoicePrefix: 'AV',
  defaultVatRate: 19,
  defaultPaymentDays: 14,
  nextInvoiceNumber: 1000,
  invoiceProfile: {
    companyName: '',
    companySuffix: '',
    owner: '',
    legalForm: '',
    street: '',
    postalCode: '',
    city: '',
    country: '',
    phone: '',
    fax: '',
    email: '',
    website: '',
    taxNumber: '',
    vatId: '',
    bankName: '',
    accountNumber: '',
    blz: '',
    iban: '',
    bic: '',
    defaultContactPerson: '',
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
  migrateToScoped(DRAFTS_KEY);
  const drafts = normalizeArray(readJson(scopedKey(DRAFTS_KEY), []));
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
  writeJson(scopedKey(DRAFTS_KEY), drafts);
  return payload;
};

export const deleteInvoiceDraft = (draftId) => {
  if (!draftId) return;
  const drafts = listInvoiceDrafts().filter((draft) => draft.id !== draftId);
  writeJson(scopedKey(DRAFTS_KEY), drafts);
};

export const listInvoices = () => {
  migrateToScoped(INVOICES_KEY);
  const invoices = normalizeArray(readJson(scopedKey(INVOICES_KEY), []));
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
  writeJson(scopedKey(INVOICES_KEY), invoices);
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
  writeJson(scopedKey(INVOICES_KEY), invoices);
  return invoices[index];
};

// Move invoice to trash instead of permanent delete
export const deleteInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const invoices = listInvoices();
  const invoice = invoices.find((inv) => inv.id === invoiceId);
  if (invoice) {
    // Move to trash
    const trash = listTrashedInvoices();
    trash.unshift({
      ...invoice,
      deletedAt: new Date().toISOString(),
    });
    writeJson(TRASH_KEY, trash);
  }
  const remaining = invoices.filter((inv) => inv.id !== invoiceId);
  writeJson(scopedKey(INVOICES_KEY), remaining);
};

// Trash management
export const listTrashedInvoices = () => {
  const now = Date.now();
  const cutoff = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  migrateToScoped(TRASH_KEY);
  const trash = normalizeArray(readJson(scopedKey(TRASH_KEY), []));
  // Auto-purge invoices older than 14 days
  const valid = trash.filter((inv) => {
    const deletedAt = new Date(inv.deletedAt || 0).getTime();
    return now - deletedAt < cutoff;
  });
  if (valid.length !== trash.length) {
    writeJson(scopedKey(TRASH_KEY), valid);
  }
  return valid.sort((a, b) => {
    const aTime = new Date(b.deletedAt || 0).getTime();
    const bTime = new Date(a.deletedAt || 0).getTime();
    return aTime - bTime;
  });
};

export const restoreInvoice = (invoiceId) => {
  if (!invoiceId) return null;
  const trash = listTrashedInvoices();
  const invoice = trash.find((inv) => inv.id === invoiceId);
  if (!invoice) return null;
  // Remove deletedAt and restore
  const { deletedAt, ...restored } = invoice;
  upsertInvoice(restored);
  const remaining = trash.filter((inv) => inv.id !== invoiceId);
  writeJson(scopedKey(TRASH_KEY), remaining);
  return restored;
};

export const permanentlyDeleteInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const trash = listTrashedInvoices().filter((inv) => inv.id !== invoiceId);
  writeJson(scopedKey(TRASH_KEY), trash);
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
  migrateToScoped(SETTINGS_KEY);
  const raw = readJson(scopedKey(SETTINGS_KEY), {});
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
  writeJson(scopedKey(SETTINGS_KEY), payload);
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
