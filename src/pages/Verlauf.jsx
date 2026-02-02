import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, History, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/ui/StatusBadge";

const ENTITY_LABELS = {
  orders: "Auftrag",
  drivers: "Fahrer",
  customers: "Kunde",
  checklists: "Protokoll",
  profiles: "Mitarbeiter",
  storage: "Dokument",
};

const ACTION_LABELS = {
  create: "Erstellt",
  update: "Geändert",
  delete: "Gelöscht",
  upload: "Upload",
};

const STATUS_LABELS = {
  new: "Offen",
  assigned: "Zugewiesen",
  pickup_started: "Übernahme läuft",
  in_transit: "In Lieferung",
  shuttle: "Shuttle",
  zwischenabgabe: "Zwischenabgabe",
  delivery_started: "Übergabe läuft",
  completed: "Erfolgreich beendet",
  review: "Prüfung",
  ready_for_billing: "Freigabe Abrechnung",
  approved: "Freigegeben",
  cancelled: "Storniert",
};

const buildSummary = (log) => {
  const changes = log?.changes || {};
  const oldStatus = changes?.old?.status;
  const newStatus = changes?.new?.status;
  if (oldStatus || newStatus) {
    const fromLabel = STATUS_LABELS[oldStatus] || oldStatus || "-";
    const toLabel = STATUS_LABELS[newStatus] || newStatus || "-";
    return `Status: ${fromLabel} → ${toLabel}`;
  }
  if (log?.entity === "storage") {
    const bucket = changes?.bucket || changes?.new?.bucket_id || changes?.old?.bucket_id;
    const name = changes?.name || changes?.new?.name || changes?.old?.name;
    return [bucket, name].filter(Boolean).join(" • ");
  }
  return log?.description || "-";
};

export default function Verlauf() {
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const { data, error: loadError } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (loadError) {
        setError(loadError.message);
        setLogs([]);
        setLoading(false);
        return;
      }
      const items = data || [];
      setLogs(items);
      const actorIds = Array.from(
        new Set(items.map((item) => item.actor_user_id).filter(Boolean))
      );
      if (actorIds.length) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        const map = (profileData || []).reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {});
        setProfiles(map);
      }
      setLoading(false);
    };
    load();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (entityFilter !== "all" && log.entity !== entityFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      const actor = profiles[log.actor_user_id];
      const summary = buildSummary(log);
      return (
        log.entity?.toLowerCase().includes(query) ||
        log.action?.toLowerCase().includes(query) ||
        log.actor_email?.toLowerCase().includes(query) ||
        actor?.full_name?.toLowerCase().includes(query) ||
        summary?.toLowerCase().includes(query)
      );
    });
  }, [logs, search, entityFilter, actionFilter, profiles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div>
          <Link to={createPageUrl("AdminControlling")}>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Zurück zu Admin Controlling
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <History className="h-6 w-6 text-[#1e3a5f]" />
          Verlauf
        </h1>
        <p className="text-slate-500">
          Übersicht aller wichtigen Aktionen in deinem Unternehmen.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Aktion, Nutzer oder Status"
                className="pl-9"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Bereich" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Bereiche</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Aktion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Aktionen</SelectItem>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Audit‑Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-sm text-red-600">{error}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Keine Einträge gefunden.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const actor = profiles[log.actor_user_id];
                const timeLabel = log.created_at
                  ? format(new Date(log.created_at), "dd.MM.yyyy HH:mm")
                  : "-";
                const summary = buildSummary(log);
                return (
                  <div key={log.id} className="px-4 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {ENTITY_LABELS[log.entity] || log.entity}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{summary}</p>
                      {log.changes?.new?.status && (
                        <div className="mt-1">
                          <StatusBadge status={log.changes.new.status} size="sm" />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      <div>{timeLabel}</div>
                      <div>{actor?.full_name || log.actor_email || "System"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
