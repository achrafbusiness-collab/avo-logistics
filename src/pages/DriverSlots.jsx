import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Plus, Minus, Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  Calendar, CreditCard, Info,
} from "lucide-react";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "–");

export default function DriverSlots() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [driverCount, setDriverCount] = useState(0);
  const [changes, setChanges] = useState([]);
  const [newSlots, setNewSlots] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reductionEmail, setReductionEmail] = useState("");
  const [reductionSlots, setReductionSlots] = useState("");
  const [reductionReason, setReductionReason] = useState("");
  const [sendingReduction, setSendingReduction] = useState(false);
  const [reductionMessage, setReductionMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = await appClient.auth.getCurrentUser();
      setUser(currentUser);
      if (!currentUser?.company_id) { setLoading(false); return; }

      const { data: comp } = await supabase
        .from("companies")
        .select("id, name, driver_limit, price_per_driver")
        .eq("id", currentUser.company_id)
        .maybeSingle();
      setCompany(comp);

      const { data: drivers } = await supabase
        .from("drivers")
        .select("id")
        .eq("company_id", currentUser.company_id);
      setDriverCount(drivers?.length || 0);

      const { data: changeLog } = await supabase
        .from("driver_limit_changes")
        .select("*")
        .eq("company_id", currentUser.company_id)
        .order("created_at", { ascending: false })
        .limit(20);
      setChanges(changeLog || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const currentLimit = company?.driver_limit || 0;
  const pricePerSlot = company?.price_per_driver || 30;
  const freeSlots = Math.max(0, currentLimit - driverCount);

  // Anteilige Berechnung für Erhöhung
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - today.getDate() + 1;
  const additionalSlots = parseInt(newSlots, 10) || 0;
  const proratedCost = additionalSlots > 0
    ? (additionalSlots * pricePerSlot * daysRemaining) / daysInMonth
    : 0;

  // Reduzierung: Deadline prüfen
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEnd = Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));
  const canReduceThisMonth = daysUntilEnd >= 7;

  const handleIncrease = async () => {
    if (additionalSlots <= 0) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const newLimit = currentLimit + additionalSlots;

      // Limit ändern
      await supabase
        .from("companies")
        .update({ driver_limit: newLimit })
        .eq("id", company.id);

      // Log erstellen
      await supabase.from("driver_limit_changes").insert({
        company_id: company.id,
        old_limit: currentLimit,
        new_limit: newLimit,
        change_type: "increase",
        effective_date: today.toISOString().split("T")[0],
        requested_by: user?.email || user?.full_name || "System",
        status: "active",
        notes: `+${additionalSlots} Slots hinzugebucht. Wirksam ab ${today.toLocaleDateString("de-DE")}.`,
      });

      setMessage(`Erhöhung erfolgreich! Neues Limit: ${newLimit} Fahrer-Slots. Sie können jetzt ${newLimit} Fahrer anlegen.`);
      setNewSlots("");
      await loadData();
    } catch (err) {
      setError(err?.message || "Erhöhung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleReductionRequest = async () => {
    const targetSlots = parseInt(reductionSlots, 10);
    if (!targetSlots || targetSlots >= currentLimit || targetSlots < 1) {
      setError("Ungültiges Ziel. Minimum: 1 Slot.");
      return;
    }
    if (targetSlots < driverCount) {
      setError(`Sie haben ${driverCount} aktive Fahrer. Bitte zuerst Fahrer entfernen.`);
      return;
    }
    setSendingReduction(true);
    setReductionMessage("");
    try {
      const effectiveMonth = canReduceThisMonth
        ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
        : new Date(today.getFullYear(), today.getMonth() + 2, 1);

      // Log als "pending"
      await supabase.from("driver_limit_changes").insert({
        company_id: company.id,
        old_limit: currentLimit,
        new_limit: targetSlots,
        change_type: "decrease",
        effective_date: effectiveMonth.toISOString().split("T")[0],
        requested_by: user?.email || user?.full_name || "System",
        status: "pending",
        notes: reductionReason || "",
      });

      // E-Mail an Admin
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (token) {
        await fetch("/api/request-upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user?.id,
            email: user?.email,
            company_id: company?.id,
            full_name: user?.full_name,
            type: "slot_reduction",
            message: `Reduzierung von ${currentLimit} auf ${targetSlots} Slots. Wirksam ab ${formatDate(effectiveMonth)}. ${canReduceThisMonth ? "(Fristgerecht)" : "(Zu spät für diesen Monat → nächster Monat)"}. Grund: ${reductionReason || "–"}`,
          }),
        });
      }

      setReductionMessage(
        canReduceThisMonth
          ? `Reduzierung beantragt. Wirksam ab ${formatDate(effectiveMonth)} (nächster Monat).`
          : `Frist von 7 Tagen nicht eingehalten. Reduzierung wirksam erst ab ${formatDate(effectiveMonth)}.`
      );
      setReductionSlots("");
      setReductionReason("");
      await loadData();
    } catch (err) {
      setError(err?.message || "Anfrage fehlgeschlagen.");
    } finally {
      setSendingReduction(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Lade...
      </div>
    );
  }

  if (!company) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-500">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <p>Kein Unternehmen zugeordnet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fahrer-Slots</h1>
        <p className="text-sm text-slate-500">Verwalten Sie Ihre gebuchten Fahrer-Slots.</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="mx-auto mb-1 h-5 w-5 text-[#1e3a5f]" />
            <p className="text-2xl font-bold text-[#1e3a5f]">{currentLimit}</p>
            <p className="text-xs text-slate-500">Gebuchte Slots</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="mx-auto mb-1 h-5 w-5 text-green-600" />
            <p className="text-2xl font-bold text-green-600">{driverCount}</p>
            <p className="text-xs text-slate-500">Aktive Fahrer</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="mx-auto mb-1 h-5 w-5 text-slate-400" />
            <p className="text-2xl font-bold text-slate-600">{freeSlots}</p>
            <p className="text-xs text-slate-500">Freie Slots</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
            <p className="text-2xl font-bold text-emerald-600">{currentLimit}</p>
            <p className="text-xs text-slate-500">Max. Fahrer</p>
          </CardContent>
        </Card>
      </div>

      {/* Erhöhung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-green-600" />
            Slots erhöhen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <Label>Zusätzliche Slots</Label>
              <Input
                type="number"
                min="1"
                value={newSlots}
                onChange={(e) => setNewSlots(e.target.value)}
                placeholder="z.B. 3"
                className="w-32"
              />
            </div>
            <Button
              onClick={handleIncrease}
              disabled={saving || additionalSlots <= 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Slots hinzubuchen
            </Button>
          </div>
          {additionalSlots > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-blue-800">Vorschau:</p>
              <p className="text-blue-700">Neues Limit: {currentLimit} → <strong>{currentLimit + additionalSlots}</strong> Fahrer-Slots</p>
              <p className="text-blue-700">Sofort wirksam — Sie können direkt {currentLimit + additionalSlots} Fahrer anlegen.</p>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>Sofort wirksam. Anteilige Abrechnung tagesgenau ab heute bis Monatsende, danach vollständig.</p>
          </div>
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reduzierung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Minus className="h-5 w-5 text-amber-600" />
            Slots reduzieren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canReduceThisMonth && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Weniger als 7 Tage bis Monatsende. Eine Reduzierung greift erst ab dem übernächsten Monat.</p>
            </div>
          )}
          <div className="flex items-end gap-3">
            <div>
              <Label>Neues Limit (min. 1)</Label>
              <Input
                type="number"
                min="1"
                max={currentLimit - 1}
                value={reductionSlots}
                onChange={(e) => setReductionSlots(e.target.value)}
                placeholder={`Aktuell: ${currentLimit}`}
                className="w-32"
              />
            </div>
          </div>
          <div>
            <Label>Grund (optional)</Label>
            <Textarea
              value={reductionReason}
              onChange={(e) => setReductionReason(e.target.value)}
              rows={2}
              placeholder="z.B. Saisonale Anpassung"
            />
          </div>
          <Button
            onClick={handleReductionRequest}
            disabled={sendingReduction || !reductionSlots}
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {sendingReduction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Minus className="w-4 h-4 mr-2" />}
            Reduzierung beantragen
          </Button>
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>Nur zum Monatsende möglich. Schriftliche Anfrage muss mindestens 7 Tage vor Monatsende eingehen. Minimum: 1 Slot.</p>
          </div>
          {reductionMessage && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> {reductionMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Änderungshistorie */}
      {changes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Änderungshistorie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {changes.map((change) => (
                <div
                  key={change.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm ${
                    change.change_type === "increase"
                      ? "border-green-200 bg-green-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {change.change_type === "increase" ? (
                      <Plus className="h-4 w-4 text-green-600" />
                    ) : (
                      <Minus className="h-4 w-4 text-amber-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {change.old_limit} → {change.new_limit} Slots
                        {change.status === "pending" && (
                          <span className="ml-2 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            Ausstehend
                          </span>
                        )}
                      </p>
                      {change.notes && <p className="text-xs text-slate-500">{change.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{formatDate(change.effective_date)}</p>
                    <p>{change.requested_by}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
