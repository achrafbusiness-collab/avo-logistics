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

    const { data: activeOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, status, assigned_driver_id")
      .eq("company_id", profile.company_id)
      .in("status", [
        "new",
        "assigned",
        "pickup_started",
        "in_transit",
        "delivery_started",
        "zwischenabgabe",
        "shuttle",
      ]);

    if (ordersError) {
      res.status(500).json({ ok: false, error: ordersError.message });
      return;
    }

    const orders = activeOrders || [];
    if (!orders.length) {
      res.status(200).json({ ok: true, updated: 0, reasons: { noDriver: 0, handoff: 0 } });
      return;
    }

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

    const handoffIds = [];
    const inTransitIds = [];
    const resetIds = [];

    orders.forEach((order) => {
      const latest = latestSegmentByOrder.get(order.id);
      if (latest?.segment_type === "handoff") {
        handoffIds.push(order.id);
        return;
      }
      if (order.assigned_driver_id) {
        if (order.status !== "in_transit") {
          inTransitIds.push(order.id);
        }
        return;
      }
      if (
        ["assigned", "pickup_started", "in_transit", "delivery_started", "zwischenabgabe", "shuttle"].includes(
          order.status
        )
      ) {
        resetIds.push(order.id);
      }
    });

    let updatedTotal = 0;
    const reasons = { handoff: handoffIds.length, toInTransit: inTransitIds.length, toNew: resetIds.length };

    if (handoffIds.length) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .update({
          status: "zwischenabgabe",
          assigned_driver_id: null,
          assigned_driver_name: "",
        })
        .eq("company_id", profile.company_id)
        .in("id", handoffIds)
        .select("id");
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      updatedTotal += data?.length || 0;
    }

    if (inTransitIds.length) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .update({ status: "in_transit" })
        .eq("company_id", profile.company_id)
        .in("id", inTransitIds)
        .select("id");
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      updatedTotal += data?.length || 0;
    }

    if (resetIds.length) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .update({ status: "new", assigned_driver_name: "" })
        .eq("company_id", profile.company_id)
        .in("id", resetIds)
        .select("id");
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      updatedTotal += data?.length || 0;
    }

    res.status(200).json({ ok: true, updated: updatedTotal, reasons });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
