import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const systemAdminUserId =
  process.env.SYSTEM_ADMIN_USER_ID || process.env.VITE_SYSTEM_ADMIN_USER_ID;
const systemAdminEmail =
  process.env.SYSTEM_ADMIN_EMAIL || process.env.VITE_SYSTEM_ADMIN_EMAIL;

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isSystemAdmin = (profile) => {
  if (!profile) return false;
  if (systemAdminUserId && profile.id === systemAdminUserId) return true;
  if (systemAdminEmail && normalizeEmail(profile.email) === normalizeEmail(systemAdminEmail)) {
    return true;
  }
  return false;
};

const getProfileForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
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

    const profile = await getProfileForUser(authData.user.id);
    if (!profile?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }

    const canRun = profile.role === "admin" || isSystemAdmin(profile);
    if (!canRun) {
      res.status(403).json({ ok: false, error: "Keine Berechtigung." });
      return;
    }

    const { data: inTransitOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, assigned_driver_id")
      .eq("company_id", profile.company_id)
      .eq("status", "in_transit");

    if (ordersError) {
      res.status(500).json({ ok: false, error: ordersError.message });
      return;
    }

    const orders = inTransitOrders || [];
    if (!orders.length) {
      res.status(200).json({ ok: true, updated: 0, reasons: { noDriver: 0, handoff: 0 } });
      return;
    }

    const noDriverIds = orders
      .filter((order) => !order.assigned_driver_id)
      .map((order) => order.id);

    const orderIds = orders.map((order) => order.id);
    const { data: segments, error: segmentsError } = await supabaseAdmin
      .from("order_segments")
      .select("order_id, segment_type, created_date, created_at")
      .in("order_id", orderIds);

    if (segmentsError) {
      res.status(500).json({ ok: false, error: segmentsError.message });
      return;
    }

    const latestSegmentByOrder = new Map();
    (segments || []).forEach((segment) => {
      if (!segment?.order_id) return;
      const timestamp = new Date(segment.created_date || segment.created_at || 0).getTime();
      const existing = latestSegmentByOrder.get(segment.order_id);
      if (!existing || timestamp > existing.timestamp) {
        latestSegmentByOrder.set(segment.order_id, {
          timestamp,
          segment_type: segment.segment_type,
        });
      }
    });

    const handoffIds = orders
      .filter((order) => {
        const latest = latestSegmentByOrder.get(order.id);
        return latest?.segment_type === "handoff";
      })
      .map((order) => order.id);

    const updateIds = Array.from(new Set([...noDriverIds, ...handoffIds]));
    if (!updateIds.length) {
      res.status(200).json({
        ok: true,
        updated: 0,
        reasons: { noDriver: noDriverIds.length, handoff: handoffIds.length },
      });
      return;
    }

    const { data: updatedOrders, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "zwischenabgabe",
        assigned_driver_id: null,
        assigned_driver_name: "",
      })
      .eq("company_id", profile.company_id)
      .eq("status", "in_transit")
      .in("id", updateIds)
      .select("id");

    if (updateError) {
      res.status(500).json({ ok: false, error: updateError.message });
      return;
    }

    res.status(200).json({
      ok: true,
      updated: updatedOrders?.length || 0,
      reasons: { noDriver: noDriverIds.length, handoff: handoffIds.length },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
