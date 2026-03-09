import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const systemAdminUserId =
  process.env.SYSTEM_ADMIN_USER_ID || process.env.VITE_SYSTEM_ADMIN_USER_ID;
const systemAdminEmail =
  process.env.SYSTEM_ADMIN_EMAIL || process.env.VITE_SYSTEM_ADMIN_EMAIL;

const AUDIT_BATCH_SIZE = 1000;
const AUDIT_MAX_ROWS = 20000;

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const normalizeExpenses = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? item : null))
    .filter(Boolean)
    .filter((item) => {
      const type = String(item.type || "").trim();
      const note = String(item.note || "").trim();
      const file = String(item.file_url || "").trim();
      const amount = String(item.amount ?? "").trim();
      return Boolean(type || note || file || amount);
    });
};

const parseJsonSafe = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getExpensesFromChangeNode = (node) => {
  if (!node || typeof node !== "object") return [];
  return normalizeExpenses(node.expenses);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const getProfileForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
};

const isSystemAdmin = (profile) => {
  if (!profile) return false;
  if (systemAdminUserId && profile.id === systemAdminUserId) return true;
  if (systemAdminEmail && normalizeEmail(profile.email) === normalizeEmail(systemAdminEmail)) {
    return true;
  }
  return false;
};

const loadChecklistAuditRows = async ({ companyId, orderId, sinceIso }) => {
  const rows = [];
  for (let offset = 0; offset < AUDIT_MAX_ROWS; offset += AUDIT_BATCH_SIZE) {
    let query = supabaseAdmin
      .from("audit_logs")
      .select("entity_id, created_at, changes")
      .eq("company_id", companyId)
      .eq("entity", "checklists")
      .eq("action", "update")
      .order("created_at", { ascending: false })
      .range(offset, offset + AUDIT_BATCH_SIZE - 1);

    if (sinceIso) {
      query = query.gte("created_at", sinceIso);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01") {
        return { rows: [], missingAuditTable: true };
      }
      throw new Error(error.message);
    }

    const chunk = data || [];
    if (!chunk.length) break;
    if (orderId) {
      for (const row of chunk) {
        const changes = parseJsonSafe(row.changes);
        const newOrderId = changes?.new?.order_id || null;
        const oldOrderId = changes?.old?.order_id || null;
        if (newOrderId === orderId || oldOrderId === orderId) {
          rows.push(row);
        }
      }
    } else {
      rows.push(...chunk);
    }
    if (chunk.length < AUDIT_BATCH_SIZE) break;
  }
  return { rows, missingAuditTable: false };
};

const buildRecoveryMap = (auditRows) => {
  const latestStateByChecklist = new Map();
  const recoveryByChecklist = new Map();

  for (const row of auditRows) {
    const checklistId = row?.entity_id;
    if (!checklistId) continue;
    const changes = parseJsonSafe(row.changes);
    const oldExpenses = getExpensesFromChangeNode(changes?.old);
    const newExpenses = getExpensesFromChangeNode(changes?.new);

    if (!latestStateByChecklist.has(checklistId)) {
      latestStateByChecklist.set(checklistId, newExpenses);
    }
    const latestNewExpenses = latestStateByChecklist.get(checklistId) || [];
    if (
      latestNewExpenses.length === 0 &&
      newExpenses.length === 0 &&
      oldExpenses.length > 0 &&
      !recoveryByChecklist.has(checklistId)
    ) {
      recoveryByChecklist.set(checklistId, {
        expenses: oldExpenses,
        sourceCreatedAt: row.created_at || null,
      });
    }
  }
  return recoveryByChecklist;
};

const fetchCurrentChecklists = async ({ companyId, orderId }) => {
  let query = supabaseAdmin
    .from("checklists")
    .select("id, order_id, expenses")
    .eq("company_id", companyId);
  if (orderId) {
    query = query.eq("order_id", orderId);
  }
  const { data, error } = await query.limit(5000);
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: "Supabase admin env vars missing" });
    return;
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "Missing auth token" });
      return;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ ok: false, error: "Invalid auth token" });
      return;
    }

    const requester = await getProfileForUser(authData.user.id);
    if (!requester?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const canRun = requester.role === "admin" || isSystemAdmin(requester);
    if (!canRun) {
      res.status(403).json({ ok: false, error: "Keine Berechtigung." });
      return;
    }

    const body = await readJsonBody(req);
    const orderId = body?.orderId ? String(body.orderId) : null;
    const dryRun = Boolean(body?.dryRun);
    const sinceDaysRaw = Number(body?.sinceDays);
    const sinceDays = Number.isFinite(sinceDaysRaw) && sinceDaysRaw > 0 ? sinceDaysRaw : 120;
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    const { rows: auditRows, missingAuditTable } = await loadChecklistAuditRows({
      companyId: requester.company_id,
      orderId,
      sinceIso,
    });

    if (missingAuditTable) {
      res.status(200).json({
        ok: true,
        updated: 0,
        candidates: 0,
        inspectedAuditRows: 0,
        message: "audit_logs nicht vorhanden",
      });
      return;
    }

    const recoveryByChecklist = buildRecoveryMap(auditRows);
    if (!recoveryByChecklist.size) {
      res.status(200).json({
        ok: true,
        updated: 0,
        candidates: 0,
        inspectedAuditRows: auditRows.length,
      });
      return;
    }

    const currentChecklists = await fetchCurrentChecklists({
      companyId: requester.company_id,
      orderId,
    });
    const currentById = new Map(currentChecklists.map((item) => [item.id, item]));

    const updates = [];
    const skippedAlreadyFilled = [];

    for (const [checklistId, recovery] of recoveryByChecklist.entries()) {
      const checklist = currentById.get(checklistId);
      if (!checklist) continue;
      const currentExpenses = normalizeExpenses(checklist.expenses);
      if (currentExpenses.length > 0) {
        skippedAlreadyFilled.push(checklistId);
        continue;
      }
      updates.push({
        id: checklistId,
        order_id: checklist.order_id || null,
        expenses: recovery.expenses,
        sourceCreatedAt: recovery.sourceCreatedAt || null,
      });
    }

    if (dryRun || !updates.length) {
      res.status(200).json({
        ok: true,
        updated: 0,
        candidates: updates.length,
        inspectedAuditRows: auditRows.length,
        skippedAlreadyFilled: skippedAlreadyFilled.length,
        preview: updates.slice(0, 20),
      });
      return;
    }

    let updated = 0;
    const failed = [];

    for (const update of updates) {
      const { error } = await supabaseAdmin
        .from("checklists")
        .update({
          expenses: update.expenses,
          updated_date: new Date().toISOString(),
        })
        .eq("id", update.id)
        .eq("company_id", requester.company_id);
      if (error) {
        failed.push({ id: update.id, error: error.message });
        continue;
      }
      updated += 1;
    }

    res.status(200).json({
      ok: true,
      updated,
      candidates: updates.length,
      failed,
      inspectedAuditRows: auditRows.length,
      skippedAlreadyFilled: skippedAlreadyFilled.length,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
