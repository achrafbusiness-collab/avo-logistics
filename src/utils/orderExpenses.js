const normalizeText = (value) => String(value ?? "").trim();

export const normalizeExpenseEntry = (expense) => {
  if (!expense || typeof expense !== "object") return null;
  return {
    ...expense,
    type: normalizeText(expense.type),
    amount: normalizeText(expense.amount),
    note: normalizeText(expense.note),
    file_url: normalizeText(expense.file_url),
    file_name: normalizeText(expense.file_name),
    file_type: normalizeText(expense.file_type),
  };
};

export const hasExpenseContent = (expense) => {
  const normalized = normalizeExpenseEntry(expense);
  if (!normalized) return false;
  return Boolean(
    normalized.type ||
      normalized.amount ||
      normalized.note ||
      normalized.file_url ||
      normalized.file_name
  );
};

export const isUploadedExpense = (expense) => {
  const normalized = normalizeExpenseEntry(expense);
  return Boolean(normalized?.file_url);
};

const buildFallbackKey = (expense) =>
  [
    normalizeText(expense?.type).toLowerCase(),
    normalizeText(expense?.amount),
    normalizeText(expense?.note).toLowerCase(),
    normalizeText(expense?.file_name).toLowerCase(),
  ].join("|");

export const buildExpenseFingerprint = (expense) => {
  const normalized = normalizeExpenseEntry(expense);
  if (!normalized) return "";
  if (normalized.file_url) return `file:${normalized.file_url.toLowerCase()}`;
  return `meta:${buildFallbackKey(normalized)}`;
};

export const mergeExpenseLists = (...lists) => {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawExpense of list) {
      const expense = normalizeExpenseEntry(rawExpense);
      if (!hasExpenseContent(expense)) continue;
      const fingerprint = buildExpenseFingerprint(expense);
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      merged.push(expense);
    }
  }
  return merged;
};

export const buildOrderExpensePoolFromChecklists = (checklists = []) =>
  mergeExpenseLists(
    ...(Array.isArray(checklists)
      ? checklists.map((checklist) => (Array.isArray(checklist?.expenses) ? checklist.expenses : []))
      : [])
  );
