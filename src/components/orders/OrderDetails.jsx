import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { appClient } from "@/api/appClient";
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
  Loader2,
  Paperclip,
  Upload
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
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [docEdits, setDocEdits] = useState({});
  const [docSaving, setDocSaving] = useState({});
  const [docDeleting, setDocDeleting] = useState({});
  const [docDragActive, setDocDragActive] = useState(false);
  const [orderSegments, setOrderSegments] = useState([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentsError, setSegmentsError] = useState('');
  const [segmentEdits, setSegmentEdits] = useState({});
  const [segmentSaving, setSegmentSaving] = useState({});
  const [orderHandoffs, setOrderHandoffs] = useState([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [handoffsError, setHandoffsError] = useState('');
  const docInputRef = useRef(null);
  const pickupChecklist = checklists.find(c => c.type === 'pickup');
  const dropoffChecklist = checklists.find(c => c.type === 'dropoff');
  const expensesChecklist = useMemo(() => {
    if (dropoffChecklist?.expenses?.length) return dropoffChecklist;
    return checklists.find((checklist) => Array.isArray(checklist.expenses) && checklist.expenses.length);
  }, [checklists, dropoffChecklist]);
  const expenses = Array.isArray(expensesChecklist?.expenses) ? expensesChecklist.expenses : [];
  const protocolChecklistId = dropoffChecklist?.id || pickupChecklist?.id || expensesChecklist?.id || null;
  const [protocolDialogOpen, setProtocolDialogOpen] = useState(false);
  const [expensesDialogOpen, setExpensesDialogOpen] = useState(false);
  const [expenseTypeFilter, setExpenseTypeFilter] = useState('all');
  const isAdmin = currentUser?.role === 'admin';
  const distanceKm = order?.distance_km ?? null;
  const driverPrice = order?.driver_price ?? null;
  const showDriverPrice = currentUser?.role !== 'driver';
  const showSegmentPricing = currentUser?.role !== 'driver';
  const expenseTypeLabels = {
    fuel: 'Tank',
    ticket: 'Ticket',
    taxi: 'Taxi',
    toll: 'Maut',
    additional_protocol: 'Zusatzprotokoll',
  };
  const formatCurrency = (value) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
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
  const filteredExpenses =
    expenseTypeFilter === 'all'
      ? expenses
      : expenses.filter((expense) => expense?.type === expenseTypeFilter);
  const openExpenseFile = (expense) => {
    if (!expense?.file_url) return;
    try {
      const url = new URL(expense.file_url);
      url.searchParams.set('download', '1');
      const link = document.createElement('a');
      link.href = url.toString();
      link.download = expense.file_name || 'beleg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      const link = document.createElement('a');
      link.href = expense.file_url;
      link.download = expense.file_name || 'beleg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    window.open(expense.file_url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    setReviewChecks(buildReviewChecks(order?.review_checks));
    setReviewNotes(order?.review_notes || '');
    setOverrideStatus(order?.status || 'assigned');
    setOverrideReason('');
    setStatusError('');
  }, [order]);

  useEffect(() => {
    const loadNotes = async () => {
      if (!order?.id) return;
      setNotesLoading(true);
      setNotesError('');
      try {
        const data = await appClient.entities.OrderNote.filter(
          { order_id: order.id },
          '-created_at',
          200
        );
        const sorted = [...data].sort((a, b) => {
          if (a.is_pinned === b.is_pinned) {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          return a.is_pinned ? -1 : 1;
        });
        setNotes(sorted);
      } catch (err) {
        setNotesError(err?.message || 'Notizen konnten nicht geladen werden.');
      } finally {
        setNotesLoading(false);
      }
    };
    loadNotes();
  }, [order?.id]);

  useEffect(() => {
    const loadDocuments = async () => {
      if (!order?.id) return;
      setDocsLoading(true);
      setDocsError('');
      try {
        const list = await appClient.entities.OrderDocument.filter(
          { order_id: order.id },
          '-created_date',
          200
        );
        setDocuments(list || []);
      } catch (err) {
        setDocsError(err?.message || 'Dokumente konnten nicht geladen werden.');
      } finally {
        setDocsLoading(false);
      }
    };
    loadDocuments();
  }, [order?.id]);

  useEffect(() => {
    const loadSegments = async () => {
      if (!order?.id) return;
      setSegmentsLoading(true);
      setSegmentsError('');
      try {
        const list = await appClient.entities.OrderSegment.filter(
          { order_id: order.id },
          'created_date',
          200
        );
        const sorted = [...(list || [])].sort((a, b) => {
          const aDate = new Date(a.created_date || a.created_at || 0).getTime();
          const bDate = new Date(b.created_date || b.created_at || 0).getTime();
          return aDate - bDate;
        });
        setOrderSegments(sorted);
        setSegmentEdits((prev) => {
          const next = { ...prev };
          sorted.forEach((segment) => {
            if (next[segment.id] === undefined) {
              next[segment.id] = segment.price !== null && segment.price !== undefined ? String(segment.price) : '';
            }
          });
          return next;
        });
      } catch (err) {
        setSegmentsError(err?.message || 'Zwischenstrecken konnten nicht geladen werden.');
      } finally {
        setSegmentsLoading(false);
      }
    };
    loadSegments();
  }, [order?.id]);

  useEffect(() => {
    const loadHandoffs = async () => {
      if (!order?.id) return;
      setHandoffsLoading(true);
      setHandoffsError('');
      try {
        const list = await appClient.entities.OrderHandoff.filter(
          { order_id: order.id },
          'created_date',
          200
        );
        const sorted = [...(list || [])].sort((a, b) => {
          const aDate = new Date(a.created_date || a.created_at || 0).getTime();
          const bDate = new Date(b.created_date || b.created_at || 0).getTime();
          return aDate - bDate;
        });
        setOrderHandoffs(sorted);
      } catch (err) {
        setHandoffsError(err?.message || 'Zwischenabgaben konnten nicht geladen werden.');
      } finally {
        setHandoffsLoading(false);
      }
    };
    loadHandoffs();
  }, [order?.id]);


  const startDocEdit = (doc) => {
    setDocEdits((prev) => ({
      ...prev,
      [doc.id]: {
        title: doc.title ?? doc.file_name ?? '',
        category: doc.category ?? '',
        editing: true,
      },
    }));
  };

  const cancelDocEdit = (docId) => {
    setDocEdits((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        editing: false,
      },
    }));
  };

  const handleDocFieldChange = (docId, field, value) => {
    setDocEdits((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        [field]: value,
      },
    }));
  };

  const saveDocEdit = async (doc) => {
    const draft = docEdits[doc.id];
    if (!draft) return;
    setDocSaving((prev) => ({ ...prev, [doc.id]: true }));
    setDocsError('');
    try {
      const updated = await appClient.entities.OrderDocument.update(doc.id, {
        title: draft.title?.trim() || null,
        category: draft.category?.trim() || null,
      });
      setDocuments((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setDocEdits((prev) => ({
        ...prev,
        [doc.id]: { ...draft, editing: false },
      }));
    } catch (error) {
      setDocsError(error?.message || 'Dokument konnte nicht gespeichert werden.');
    } finally {
      setDocSaving((prev) => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleDocDelete = async (doc) => {
    if (!doc?.id) return;
    setDocDeleting((prev) => ({ ...prev, [doc.id]: true }));
    setDocsError('');
    try {
      await appClient.entities.OrderDocument.delete(doc.id);
      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
    } catch (error) {
      setDocsError(error?.message || 'Dokument konnte nicht gelöscht werden.');
    } finally {
      setDocDeleting((prev) => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleDocFile = async (file) => {
    if (!file || !order?.id) return;
    if (!order?.company_id) {
      setDocsError('Unternehmen fehlt am Auftrag. Bitte Auftrag neu laden.');
      return;
    }
    setDocsUploading(true);
    setDocsError('');
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({
        file,
        companyId: order.company_id,
        pathPrefix: 'orders',
      });
      const created = await appClient.entities.OrderDocument.create({
        order_id: order.id,
        company_id: order.company_id,
        file_url,
        file_name: file.name,
        title: file.name,
        category: '',
        uploaded_by_user_id: currentUser?.id || null,
        uploaded_by_name: currentUser?.full_name || currentUser?.email || '',
        uploaded_by_email: currentUser?.email || '',
      });
      setDocuments((prev) => [created, ...prev]);
    } catch (error) {
      setDocsError(error?.message || 'Dokument konnte nicht hochgeladen werden.');
    } finally {
      setDocsUploading(false);
    }
  };

  const handleDocUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleDocFile(file);
    event.target.value = '';
  };

  const handleDocDrop = async (event) => {
    event.preventDefault();
    setDocDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await handleDocFile(file);
  };

  const handleDocDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDocDragActive(true);
  };

  const handleDocDragLeave = () => {
    setDocDragActive(false);
  };

  const openDocPicker = () => {
    docInputRef.current?.click();
  };

  const getSegmentStatus = (segment) => {
    if (segment.price_status) return segment.price_status;
    if (segment.price !== null && segment.price !== undefined && segment.price !== '') {
      return 'approved';
    }
    return 'pending';
  };

  const segmentsMissingPrice = orderSegments.filter(
    (segment) => getSegmentStatus(segment) === 'pending'
  );
  const segmentCostTotal = useMemo(() => {
    return orderSegments.reduce((sum, segment) => {
      const value = parseFloat(segment.price);
      if (getSegmentStatus(segment) === 'approved' && Number.isFinite(value)) {
        return sum + value;
      }
      return sum;
    }, 0);
  }, [orderSegments]);

  const handleSegmentPriceChange = (segmentId, value) => {
    setSegmentEdits((prev) => ({ ...prev, [segmentId]: value }));
  };

  const saveSegmentPrice = async (segment) => {
    const rawValue = segmentEdits[segment.id];
    const parsed = rawValue === '' || rawValue === null || rawValue === undefined ? null : parseFloat(rawValue);
    if (rawValue !== '' && Number.isNaN(parsed)) {
      setSegmentsError('Bitte einen gültigen Preis eingeben.');
      return;
    }
    setSegmentSaving((prev) => ({ ...prev, [segment.id]: true }));
    setSegmentsError('');
    try {
      const updatePayload = {
        price: parsed,
        price_status: parsed === null ? 'pending' : 'approved',
        price_rejection_reason: null,
      };
      const updated = await appClient.entities.OrderSegment.update(segment.id, updatePayload);
      setOrderSegments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setSegmentsError(error?.message || 'Preis konnte nicht gespeichert werden.');
    } finally {
      setSegmentSaving((prev) => ({ ...prev, [segment.id]: false }));
    }
  };

  const canManageDocs = currentUser?.role !== 'driver';
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

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    if (!currentUser) {
      setNotesError('Bitte erneut anmelden.');
      return;
    }
    setNotesSaving(true);
    setNotesError('');
    try {
      const created = await appClient.entities.OrderNote.create({
        order_id: order.id,
        author_user_id: currentUser.id,
        author_name: currentUser.full_name || '',
        author_email: currentUser.email || '',
        note: noteText.trim(),
        is_pinned: notePinned,
      });
      const updated = [created, ...notes].sort((a, b) => {
        if (a.is_pinned === b.is_pinned) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return a.is_pinned ? -1 : 1;
      });
      setNotes(updated);
      setNoteText('');
      setNotePinned(false);
    } catch (err) {
      setNotesError(err?.message || 'Notiz konnte nicht gespeichert werden.');
    } finally {
      setNotesSaving(false);
    }
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
            {order.customer_order_number && (
              <p className="text-sm text-gray-500">
                Kunden-Ref: {order.customer_order_number}
              </p>
            )}
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
                  {pickupChecklist?.location_confirmed === false && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                      <p className="font-semibold">Abweichende Abholadresse</p>
                      <p>{pickupChecklist.location || '-'}</p>
                      {pickupChecklist.location_reason && (
                        <p className="mt-1 text-xs text-amber-800">
                          Grund: {pickupChecklist.location_reason}
                        </p>
                      )}
                    </div>
                  )}
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
                  {dropoffChecklist?.location_confirmed === false && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                      <p className="font-semibold">Abweichende Abgabeadresse</p>
                      <p>{dropoffChecklist.location || '-'}</p>
                      {dropoffChecklist.location_reason && (
                        <p className="mt-1 text-xs text-amber-800">
                          Grund: {dropoffChecklist.location_reason}
                        </p>
                      )}
                    </div>
                  )}
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

          {/* Internal Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#1e3a5f]" />
                Interne Notizen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Interne Notiz hinzufügen..."
                  rows={3}
                />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <Checkbox
                    checked={notePinned}
                    onCheckedChange={(checked) => setNotePinned(Boolean(checked))}
                  />
                  Wichtig markieren
                </label>
                <Button
                  size="sm"
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={handleAddNote}
                  disabled={notesSaving || !noteText.trim()}
                >
                  {notesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Notiz speichern
                </Button>
                <p className="text-xs text-gray-500">
                  Diese Notizen sind nur intern sichtbar.
                </p>
              </div>

              {notesError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {notesError}
                </div>
              )}

              {notesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Notizen werden geladen...
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-gray-500">Noch keine Notizen vorhanden.</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className={`rounded-lg border px-3 py-2 ${
                        note.is_pinned
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {note.author_name || note.author_email || "Unbekannt"}
                        </span>
                        <span>
                          {note.created_at
                            ? format(new Date(note.created_at), "dd.MM.yyyy HH:mm")
                            : "-"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                        {note.note}
                      </p>
                      {note.is_pinned && (
                        <span className="mt-2 inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
                          Wichtig
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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

          {distanceKm !== null && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Strecke</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {distanceKm} km
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {showDriverPrice && driverPrice !== null && driverPrice !== undefined && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Auftragspreis</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {formatCurrency(driverPrice)}
                  </p>
                </div>
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
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Handoffs & Segments */}
          {(orderSegments.length > 0 || orderHandoffs.length > 0 || segmentsLoading || handoffsLoading) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#1e3a5f]" />
                  Fahrer Kosten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {showSegmentPricing && segmentsMissingPrice.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Es gibt Teilstrecken ohne Preis. Bitte Preise eintragen.
                  </div>
                )}

                {segmentsError && (
                  <p className="text-sm text-red-600">{segmentsError}</p>
                )}

                {segmentsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : orderSegments.length === 0 ? (
                  <p className="text-sm text-gray-500">Keine Teilstrecken vorhanden.</p>
                ) : (
                  <div className="space-y-3">
                    {orderSegments.map((segment) => {
                      const status = getSegmentStatus(segment);
                      const statusLabel =
                        status === 'approved' ? 'Bestätigt' : status === 'rejected' ? 'Abgelehnt' : 'Offen';
                      const statusTone =
                        status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : status === 'rejected'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200';
                      return (
                        <div key={segment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">
                                  {segment.segment_type === 'handoff'
                                    ? 'Zwischenabgabe'
                                    : segment.segment_type === 'shuttle'
                                      ? 'Shuttle'
                                      : 'Übergabe'}
                                </p>
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">{segment.driver_name || 'Fahrer'}</p>
                              <p className="text-sm text-slate-700">
                                {segment.start_location || '-'} → {segment.end_location || '-'}
                              </p>
                              {segment.distance_km !== null && segment.distance_km !== undefined && (
                                <p className="text-xs text-slate-500">Strecke: {segment.distance_km} km</p>
                              )}
                              {status === 'rejected' && segment.price_rejection_reason ? (
                                <p className="text-xs text-red-600">
                                  Ablehnung: {segment.price_rejection_reason}
                                </p>
                              ) : null}
                            </div>
                            {showSegmentPricing ? (
                              <div className="flex flex-col gap-2 min-w-[140px]">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Preis (€)"
                                  value={segmentEdits[segment.id] ?? ''}
                                  onChange={(event) =>
                                    handleSegmentPriceChange(segment.id, event.target.value)
                                  }
                                />
                                <Button
                                  size="sm"
                                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                                  disabled={segmentSaving[segment.id]}
                                  onClick={() => saveSegmentPrice(segment)}
                                >
                                  {segmentSaving[segment.id] ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : null}
                                  Preis speichern
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-sm text-slate-600">
                                {status === 'approved'
                                  ? formatCurrency(segment.price)
                                  : status === 'rejected'
                                    ? 'Abgelehnt'
                                    : 'Preis offen'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {orderSegments.length > 0 && (
                  <div className="flex justify-end">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                      Gesamt Fahrerkosten:{" "}
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(segmentCostTotal)}
                      </span>
                    </div>
                  </div>
                )}

                {(orderHandoffs.length > 0 || handoffsLoading) && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">Zwischenabgaben</p>
                    {handoffsError && (
                      <p className="text-sm text-red-600">{handoffsError}</p>
                    )}
                    {handoffsLoading ? (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderHandoffs.map((handoff) => (
                          <div key={handoff.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                            <p className="font-medium text-slate-900">{handoff.location || '-'}</p>
                            <p className="text-xs text-slate-500">
                              {handoff.created_by_driver_name || 'Fahrer'} • {handoff.status === 'accepted' ? 'Bestätigt' : 'Offen'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-[#1e3a5f]" />
                Anhänge / Dokumente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManageDocs && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-500">PDF, JPG/PNG oder DOCX</p>
                  <div className="flex items-center gap-2">
                    <input
                      ref={docInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.docx"
                      onChange={handleDocUpload}
                    />
                    <Button
                      size="sm"
                      className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                      disabled={docsUploading}
                      onClick={openDocPicker}
                    >
                      {docsUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Dokument hinzufügen
                    </Button>
                  </div>
                </div>
              )}

              {docsError && (
                <p className="text-sm text-red-600">{docsError}</p>
              )}

              {canManageDocs && (
                <button
                  type="button"
                  onClick={openDocPicker}
                  onDragOver={handleDocDragOver}
                  onDragLeave={handleDocDragLeave}
                  onDrop={handleDocDrop}
                  className={`w-full rounded-xl border-2 border-dashed px-4 py-6 text-sm transition ${
                    docDragActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50/60'
                  }`}
                  disabled={docsUploading}
                >
                  Dateien hier ablegen oder klicken, um auszuwählen
                </button>
              )}

              {docsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Noch keine Dokumente hinterlegt.
                </p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => {
                    const editState = docEdits[doc.id];
                    const isEditing = editState?.editing;
                    return (
                      <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 space-y-2">
                            {isEditing ? (
                              <Input
                                value={editState.title}
                                onChange={(e) =>
                                  handleDocFieldChange(doc.id, 'title', e.target.value)
                                }
                                placeholder="Titel"
                              />
                            ) : (
                              <p className="font-semibold text-slate-900">
                                {doc.title || doc.file_name || 'Dokument'}
                              </p>
                            )}
                            <p className="text-xs text-slate-500">{doc.file_name}</p>
                            {isEditing ? (
                              <Input
                                value={editState.category}
                                onChange={(e) =>
                                  handleDocFieldChange(doc.id, 'category', e.target.value)
                                }
                                placeholder="Kategorie (optional)"
                              />
                            ) : (
                              doc.category && (
                                <p className="text-xs text-slate-500">
                                  Kategorie: {doc.category}
                                </p>
                              )
                            )}
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>
                                {formatDateSafe(doc.created_date || doc.created_at, 'dd.MM.yyyy')}
                              </span>
                              <span>•</span>
                              <span>
                                {doc.uploaded_by_name || doc.uploaded_by_email || 'Unbekannt'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline">
                                  <FileText className="w-4 h-4 mr-2" />
                                  Öffnen
                                </Button>
                              </a>
                            )}
                            {canManageDocs && !isEditing && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startDocEdit(doc)}
                              >
                                Bearbeiten
                              </Button>
                            )}
                            {canManageDocs && isEditing && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                                  disabled={docSaving[doc.id]}
                                  onClick={() => saveDocEdit(doc)}
                                >
                                  {docSaving[doc.id] ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : null}
                                  Speichern
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelDocEdit(doc.id)}
                                >
                                  Abbrechen
                                </Button>
                              </>
                            )}
                            {canManageDocs && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={docDeleting[doc.id]}
                                onClick={() => handleDocDelete(doc)}
                              >
                                {docDeleting[doc.id] ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mr-2" />
                                )}
                                Löschen
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* PDF */}
          {(protocolChecklistId || expensesChecklist) && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3">
                  <Dialog open={protocolDialogOpen} onOpenChange={setProtocolDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]" disabled={!protocolChecklistId}>
                        <FileText className="w-4 h-4 mr-2" />
                        Protokoll öffnen
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Protokoll-Details</DialogTitle>
                        <DialogDescription>
                          Übernahme- und Übergabezeiten prüfen und das PDF öffnen.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <span>Übernahme</span>
                          <span className="font-semibold">{pickupChecklistDate || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <span>Übergabe</span>
                          <span className="font-semibold">{dropoffChecklistDate || '—'}</span>
                        </div>
                      </div>
                      <DialogFooter className="gap-2 sm:justify-start">
                        {protocolChecklistId ? (
                          <a
                            href={`/checklists?id=${protocolChecklistId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                              <FileText className="w-4 h-4 mr-2" />
                              Protokoll-PDF öffnen
                            </Button>
                          </a>
                        ) : (
                          <Button disabled>Kein Protokoll vorhanden</Button>
                        )}
                        <Button variant="outline" onClick={() => setProtocolDialogOpen(false)}>
                          Schließen
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={expensesDialogOpen} onOpenChange={setExpensesDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full" disabled={!expensesChecklist}>
                        <FileText className="w-4 h-4 mr-2" />
                        Auslagen öffnen
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Auslagen</DialogTitle>
                        <DialogDescription>
                          Wähle die gewünschte Kategorie und öffne das PDF.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-4">
                        <div className="max-w-xs">
                          <Select value={expenseTypeFilter} onValueChange={setExpenseTypeFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Alle Auslagen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Alle Auslagen</SelectItem>
                              <SelectItem value="fuel">Tankbeleg</SelectItem>
                              <SelectItem value="ticket">Ticket</SelectItem>
                              <SelectItem value="taxi">Taxi</SelectItem>
                              <SelectItem value="toll">Maut</SelectItem>
                              <SelectItem value="additional_protocol">Zusatzprotokoll</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 text-sm text-slate-700">
                          {filteredExpenses.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                              Keine passenden Auslagen gefunden.
                            </div>
                          ) : (
                            filteredExpenses.map((expense, index) => (
                              <div key={`${expense.file_url || 'expense'}-${index}`} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-2 font-semibold">
                                  <span>Auslage {index + 1}</span>
                                  <span className="text-slate-500">
                                    {expenseTypeLabels[expense.type] || 'Sonstiges'}
                                  </span>
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                  <div>Betrag: {expense.amount ? formatCurrency(expense.amount) : '—'}</div>
                                  <div>Notiz: {expense.note || '—'}</div>
                                </div>
                                {expense.file_url && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3"
                                    onClick={() => openExpenseFile(expense)}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Beleg öffnen
                                  </Button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <DialogFooter className="gap-2 sm:justify-start">
                        {expensesChecklist ? (
                          <a
                            href={`/expenses-pdf?checklistId=${expensesChecklist.id}&print=1&types=${encodeURIComponent(expenseTypeFilter)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                              <FileText className="w-4 h-4 mr-2" />
                              Auslagen-PDF öffnen
                            </Button>
                          </a>
                        ) : (
                          <Button disabled>Keine Auslagen</Button>
                        )}
                        <Button variant="outline" onClick={() => setExpensesDialogOpen(false)}>
                          Schließen
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auslagen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {expenses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Keine Auslagen erfasst.
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense, index) => (
                    <div key={`${expense.file_url || 'expense'}-${index}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                        <span>Auslage {index + 1}</span>
                        <span className="text-slate-500">
                          {expenseTypeLabels[expense.type] || 'Sonstiges'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        <div>Betrag: {expense.amount ? formatCurrency(expense.amount) : '—'}</div>
                        <div>Notiz: {expense.note || '—'}</div>
                      </div>
                      {expense.file_url && (
                        <button
                          type="button"
                          onClick={() => openExpenseFile(expense)}
                          className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[#1e3a5f] hover:text-[#2d5a8a]"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {expense.file_name || 'Beleg öffnen'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {expensesChecklist && (
                <div className="text-xs text-slate-400">
                  Quelle: {expensesChecklist.type === 'dropoff' ? 'Übergabeprotokoll' : 'Protokoll'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
