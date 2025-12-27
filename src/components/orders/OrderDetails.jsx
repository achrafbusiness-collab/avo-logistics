import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  Car, 
  MapPin, 
  Calendar, 
  User, 
  Edit,
  FileText,
  ClipboardList,
  Phone,
  Mail,
  Trash2,
  ExternalLink,
  Loader2
} from 'lucide-react';

const STATUS_FLOW = [
  { value: 'assigned', label: 'Zugewiesen' },
  { value: 'pickup_started', label: 'Übernahme läuft' },
  { value: 'in_transit', label: 'In Lieferung' },
  { value: 'delivery_started', label: 'Übergabe läuft' },
  { value: 'completed', label: 'Erfolgreich beendet' },
  { value: 'review', label: 'Prüfung' },
  { value: 'ready_for_billing', label: 'Freigabe Abrechnung' },
  { value: 'approved', label: 'Freigegeben' },
];

const REVIEW_CHECKS = [
  { key: 'fuel_receipts', label: 'Tankbelege geprüft' },
  { key: 'taxi_receipts', label: 'Taxi-/Bahnquittungen geprüft' },
  { key: 'paper_protocols', label: 'Papierprotokolle geprüft' },
  { key: 'other_docs', label: 'Sonstige Unterlagen geprüft' },
];

const buildReviewChecks = (source) =>
  REVIEW_CHECKS.reduce((acc, item) => {
    acc[item.key] = source?.[item.key] ?? false;
    return acc;
  }, {});

export default function OrderDetails({
  order,
  checklists = [],
  onEdit,
  onDelete,
  drivers = [],
  onAssignDriver,
  onStatusUpdate,
  currentUser,
}) {
  const [assigning, setAssigning] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [reviewChecks, setReviewChecks] = useState(buildReviewChecks(order?.review_checks));
  const [reviewNotes, setReviewNotes] = useState(order?.review_notes || '');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState(order?.status || 'assigned');
  const [overrideReason, setOverrideReason] = useState('');
  const pickupChecklist = checklists.find(c => c.type === 'pickup');
  const dropoffChecklist = checklists.find(c => c.type === 'dropoff');
  const formatDateSafe = (value, pattern) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, pattern, { locale: de });
  };
  const pickupDate = formatDateSafe(order.pickup_date, 'dd.MM.yyyy');
  const dropoffDate = formatDateSafe(order.dropoff_date, 'dd.MM.yyyy');
  const pickupChecklistDate = formatDateSafe(pickupChecklist?.datetime, 'dd.MM.yyyy HH:mm');
  const dropoffChecklistDate = formatDateSafe(dropoffChecklist?.datetime, 'dd.MM.yyyy HH:mm');

  useEffect(() => {
    setReviewChecks(buildReviewChecks(order?.review_checks));
    setReviewNotes(order?.review_notes || '');
    setOverrideStatus(order?.status || 'assigned');
    setOverrideReason('');
    setStatusError('');
  }, [order]);

  const isAdmin = currentUser?.role === 'admin';
  const reviewComplete = useMemo(
    () => REVIEW_CHECKS.every((item) => reviewChecks[item.key]),
    [reviewChecks]
  );

  const canStartReview = Boolean(
    order?.status === 'completed' && pickupChecklist?.completed && dropoffChecklist?.completed
  );

  const canMoveToBilling = Boolean(order?.status === 'review' && reviewComplete);

  const canApprove =
    Boolean(order?.status === 'ready_for_billing' && reviewComplete && isAdmin);

  const InfoRow = ({ label, value, icon: Icon }) => (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5" />}
      <div className="flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-medium text-gray-900">{value || '-'}</p>
      </div>
    </div>
  );

  const handleDriverAssign = async (value) => {
    if (!onAssignDriver) return;
    const driverId = value === 'none' ? '' : value;
    setAssigning(true);
    try {
      await onAssignDriver(driverId);
    } finally {
      setAssigning(false);
    }
  };

  const updateOrderStatus = async (status, extra = {}) => {
    if (!onStatusUpdate) return;
    setStatusUpdating(true);
    setStatusError('');
    try {
      await onStatusUpdate(order.id, { status, ...extra });
    } catch (err) {
      setStatusError(err?.message || 'Status konnte nicht aktualisiert werden.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleReviewSave = async () => {
    if (!onStatusUpdate) return;
    setStatusUpdating(true);
    setStatusError('');
    try {
      await onStatusUpdate(order.id, {
        review_checks: reviewChecks,
        review_notes: reviewNotes,
      });
    } catch (err) {
      setStatusError(err?.message || 'Prüfung konnte nicht gespeichert werden.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAdminOverride = async () => {
    if (!overrideReason.trim()) {
      setStatusError('Bitte Begründung angeben.');
      return;
    }
    await updateOrderStatus(overrideStatus, { status_override_reason: overrideReason.trim() });
    setOverrideOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <CardTitle className="text-2xl">{order.order_number}</CardTitle>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-gray-500">
              {order.vehicle_brand} {order.vehicle_model} • {order.license_plate}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Bearbeiten
            </Button>
            <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vehicle */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Car className="w-5 h-5 text-[#1e3a5f]" />
                Fahrzeug
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoRow label="Kennzeichen" value={order.license_plate} />
              <InfoRow label="Marke" value={order.vehicle_brand} />
              <InfoRow label="Modell" value={order.vehicle_model} />
              <InfoRow label="Farbe" value={order.vehicle_color} />
              <InfoRow label="VIN" value={order.vin} />
            </CardContent>
          </Card>

          {/* Route */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#1e3a5f]" />
                Route
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pickup */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">A</span>
                    </div>
                    Abholung
                  </h4>
                  <p className="font-medium">{order.pickup_address}</p>
                  <p className="text-sm text-gray-600">
                    {[order.pickup_postal_code, order.pickup_city].filter(Boolean).join(' ')}
                  </p>
                  {pickupDate && (
                    <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {pickupDate}
                      {order.pickup_time && ` um ${order.pickup_time}`}
                    </p>
                  )}
                </div>

                {/* Dropoff */}
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">B</span>
                    </div>
                    Abgabe
                  </h4>
                  <p className="font-medium">{order.dropoff_address}</p>
                  <p className="text-sm text-gray-600">
                    {[order.dropoff_postal_code, order.dropoff_city].filter(Boolean).join(' ')}
                  </p>
                  {dropoffDate && (
                    <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {dropoffDate}
                      {order.dropoff_time && ` um ${order.dropoff_time}`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer */}
          {(order.customer_name || order.customer_phone || order.customer_email) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-[#1e3a5f]" />
                  Kunde
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoRow label="Name" value={order.customer_name} icon={User} />
                <InfoRow label="Telefon" value={order.customer_phone} icon={Phone} />
                <InfoRow label="E-Mail" value={order.customer_email} icon={Mail} />
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Bemerkungen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Driver */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-[#1e3a5f]" />
                Fahrer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-500">Fahrer zuweisen</p>
                {drivers.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine aktiven Fahrer vorhanden.</p>
                ) : (
                  <Select
                    value={order.assigned_driver_id || "none"}
                    onValueChange={handleDriverAssign}
                    disabled={assigning || !onAssignDriver}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Fahrer auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Fahrer</SelectItem>
                      {drivers.map((driver) => {
                        const name = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
                        return (
                          <SelectItem key={driver.id} value={driver.id}>
                            {name || driver.email || 'Fahrer'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                {assigning && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Zuweisung wird gespeichert…
                  </div>
                )}
              </div>
              {order.assigned_driver_id ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center font-semibold">
                    {order.assigned_driver_name?.charAt(0) || 'F'}
                  </div>
                  <div>
                    <p className="font-medium">{order.assigned_driver_name}</p>
                    <Link 
                      to={createPageUrl('Drivers') + `?id=${order.assigned_driver_id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Details anzeigen
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Kein Fahrer zugewiesen</p>
              )}
            </CardContent>
          </Card>

          {/* Workflow */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#1e3a5f]" />
                Status‑Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Aktueller Status</span>
                <StatusBadge status={order.status} size="sm" />
              </div>

              {order.status === 'new' && (
                <p className="text-xs text-gray-500">
                  Sobald ein Fahrer zugewiesen ist, startet der Workflow automatisch.
                </p>
              )}

              {order.status === 'completed' && (
                <div className="space-y-2">
                  {!pickupChecklist?.completed || !dropoffChecklist?.completed ? (
                    <p className="text-xs text-amber-600">
                      Prüfung kann erst starten, wenn Abhol‑ und Abgabeprotokoll abgeschlossen sind.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                      disabled={statusUpdating || !canStartReview}
                      onClick={() => updateOrderStatus('review')}
                    >
                      {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      In Prüfung setzen
                    </Button>
                  )}
                </div>
              )}

              {(order.status === 'review' || order.status === 'ready_for_billing' || order.status === 'approved') && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-700">Interne Prüfung</p>
                  <div className="space-y-2">
                    {REVIEW_CHECKS.map((item) => (
                      <label key={item.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={reviewChecks[item.key]}
                          onCheckedChange={(checked) =>
                            setReviewChecks((prev) => ({
                              ...prev,
                              [item.key]: Boolean(checked),
                            }))
                          }
                        />
                        <span className="text-xs text-slate-600">{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Prüfnotizen / Hinweise"
                      rows={3}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleReviewSave}
                    disabled={statusUpdating}
                  >
                    {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Prüfung speichern
                  </Button>
                </div>
              )}

              {order.status === 'review' && (
                <Button
                  size="sm"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={statusUpdating || !canMoveToBilling}
                  onClick={() =>
                    updateOrderStatus('ready_for_billing', {
                      review_checks: reviewChecks,
                      review_notes: reviewNotes,
                    })
                  }
                >
                  {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Freigabe zur Abrechnung
                </Button>
              )}

              {order.status === 'ready_for_billing' && (
                <Button
                  size="sm"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={statusUpdating || !canApprove}
                  onClick={() => updateOrderStatus('approved')}
                >
                  {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Freigeben (Buchhaltung)
                </Button>
              )}

              {order.status === 'approved' && (
                <p className="text-xs text-emerald-600">
                  Auftrag ist freigegeben. Rechnungsprozess kann starten.
                </p>
              )}

              {statusError && (
                <p className="text-xs text-red-600">{statusError}</p>
              )}

              {isAdmin && (
                <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full">
                      Admin‑Korrektur
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Status korrigieren</DialogTitle>
                      <DialogDescription>
                        Nur für Admins. Bitte Begründung angeben. Diese Änderung wird im Verlauf protokolliert.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_FLOW.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Begründung für die Korrektur"
                        rows={3}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOverrideOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button
                        className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                        onClick={handleAdminOverride}
                        disabled={statusUpdating}
                      >
                        {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Status speichern
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>

          {/* Price */}
          {order.price !== undefined && order.price !== null && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Auftragswert</p>
                <p className="text-3xl font-bold text-[#1e3a5f]">
                  {order.price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Checklists */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#1e3a5f]" />
                Protokolle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Pickup Checklist */}
              <div className={`p-3 rounded-lg border ${pickupChecklist ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Abholung</p>
                    {pickupChecklist ? (
                      <p className="text-sm text-gray-600">
                        {pickupChecklistDate || 'Datum fehlt'}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Noch nicht erstellt</p>
                    )}
                  </div>
                  {pickupChecklist && (
                    <Link to={createPageUrl('Checklists') + `?id=${pickupChecklist.id}`}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Dropoff Checklist */}
              <div className={`p-3 rounded-lg border ${dropoffChecklist ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Abgabe</p>
                    {dropoffChecklist ? (
                      <p className="text-sm text-gray-600">
                        {dropoffChecklistDate || 'Datum fehlt'}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Noch nicht erstellt</p>
                    )}
                  </div>
                  {dropoffChecklist && (
                    <Link to={createPageUrl('Checklists') + `?id=${dropoffChecklist.id}`}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PDF */}
          {order.pdf_url && (
            <Card>
              <CardContent className="pt-6">
                <a href={order.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                    <FileText className="w-4 h-4 mr-2" />
                    Protokoll-PDF öffnen
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
