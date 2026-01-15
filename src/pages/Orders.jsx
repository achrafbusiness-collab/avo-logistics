import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { addDays, format, differenceInCalendarDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StatusBadge from '@/components/ui/StatusBadge';
import OrderForm from '@/components/orders/OrderForm';
import OrderDetails from '@/components/orders/OrderDetails';
import { 
  Plus, 
  Search, 
  Filter,
  Truck,
  Check,
  ArrowLeft,
  Loader2
} from 'lucide-react';

export default function Orders() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list'); // list, form, details
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [listMode, setListMode] = useState('active');
  const [driverFilter, setDriverFilter] = useState('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [noteSaving, setNoteSaving] = useState({});
  const [noteErrors, setNoteErrors] = useState({});
  const [noteOpen, setNoteOpen] = useState({});
  const [noteEditOpen, setNoteEditOpen] = useState({});
  const [noteEditDrafts, setNoteEditDrafts] = useState({});
  const [noteEditSaving, setNoteEditSaving] = useState({});
  const listScrollTopRef = useRef(0);

  const getScrollContainer = () => document.querySelector('main');

  const storeListScroll = () => {
    const node = getScrollContainer();
    if (!node) return;
    listScrollTopRef.current = node.scrollTop;
  };

  const restoreListScroll = () => {
    const node = getScrollContainer();
    if (!node) return;
    const target = Number.isFinite(listScrollTopRef.current) ? listScrollTopRef.current : 0;
    requestAnimationFrame(() => {
      node.scrollTop = target;
    });
  };

  useEffect(() => {
    if (view === 'list') {
      restoreListScroll();
    }
  }, [view]);

  useEffect(() => {
    let active = true;
    appClient.auth.getCurrentUser().then((user) => {
      if (active) setCurrentUser(user);
    });
    return () => {
      active = false;
    };
  }, []);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 500),
  });

  const { data: orderNotes = [] } = useQuery({
    queryKey: ['order-notes'],
    queryFn: () => appClient.entities.OrderNote.list('-created_at', 500),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 1000),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.filter({ status: 'active' }),
  });

  const getDueDateTime = (order) => {
    if (!order?.dropoff_date) return null;
    const time = order.dropoff_time ? `${order.dropoff_time}:00` : '23:59:00';
    const date = new Date(`${order.dropoff_date}T${time}`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const summaryCounts = useMemo(() => {
    const now = new Date();
    const tomorrow = addDays(now, 1);
    let open = 0;
    let inDelivery = 0;
    let dueTomorrow = 0;
    let overdue = 0;

    orders.forEach((order) => {
      if (order.status === 'cancelled') return;
      if (order.status === 'in_transit') {
        inDelivery += 1;
      } else if (order.status !== 'completed') {
        open += 1;
      }

      if (order.status !== 'completed') {
        const dueAt = getDueDateTime(order);
        if (dueAt) {
          if (isSameDay(dueAt, tomorrow)) {
            dueTomorrow += 1;
          }
          if (dueAt.getTime() < now.getTime()) {
            overdue += 1;
          }
        }
      }
    });

    return { open, inDelivery, dueTomorrow, overdue };
  }, [orders]);

  const expensesByOrder = useMemo(() => {
    const map = {};
    checklists.forEach((checklist) => {
      if (!checklist?.order_id) return;
      const expenses = Array.isArray(checklist.expenses) ? checklist.expenses : [];
      const hasExpenses = expenses.some((expense) =>
        Boolean(expense?.amount || expense?.file_url || expense?.note)
      );
      if (hasExpenses) {
        map[checklist.order_id] = true;
      }
    });
    return map;
  }, [checklists]);

  const activeOrdersCount = useMemo(
    () => orders.filter((order) => order.status !== 'completed').length,
    [orders]
  );
  const completedOrdersCount = useMemo(
    () => orders.filter((order) => order.status === 'completed').length,
    [orders]
  );

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
      setSelectedOrder(null);
    },
  });

  const handleListModeChange = (nextMode) => {
    setListMode(nextMode);
    setSelectedIds([]);
    setBulkMessage('');
    setBulkError('');
    if (nextMode === 'completed') {
      setStatusFilter('completed');
    } else if (statusFilter === 'completed') {
      setStatusFilter('all');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
      setSelectedOrder(null);
      setDeleteConfirmOpen(false);
    },
  });

  // Handle URL params
  useEffect(() => {
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedOrder(null);
    } else if (urlParams.get('id')) {
      const order = orders.find(o => o.id === urlParams.get('id'));
      if (order) {
        setSelectedOrder(order);
        setView('details');
      }
    }
    if (urlParams.get('status')) {
      setStatusFilter(urlParams.get('status'));
    }
  }, [urlParams.toString(), orders]);

  const handleSave = async (data) => {
    const normalizeOrderPayload = (payload) => {
      const normalized = { ...payload };
      if (normalized.assigned_driver_id === '') {
        normalized.assigned_driver_id = null;
      }
      if (!normalized.assigned_driver_id) {
        normalized.assigned_driver_name = '';
      }
      if (normalized.customer_id === '') {
        normalized.customer_id = null;
      }
      return normalized;
    };

    if (selectedOrder) {
      const updated = await updateMutation.mutateAsync({
        id: selectedOrder.id,
        data: normalizeOrderPayload(data),
      });
    } else {
      await createMutation.mutateAsync(normalizeOrderPayload(data));
    }
  };

  const handleAssignDriver = async (driverId) => {
    if (!selectedOrder) return;
    const driver = drivers.find(d => d.id === driverId);
    const driverName = driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : '';
    const updates = {
      assigned_driver_id: driverId,
      assigned_driver_name: driverName,
    };
    if (driverId) {
      if (!selectedOrder.status || selectedOrder.status === 'new') {
        updates.status = 'assigned';
      }
    } else {
      updates.assigned_driver_id = null;
      updates.assigned_driver_name = '';
      if (selectedOrder.status === 'assigned') {
        updates.status = 'new';
      }
    }
    const updated = await appClient.entities.Order.update(selectedOrder.id, updates);
    setSelectedOrder(updated);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const handleStatusUpdate = async (orderId, data) => {
    const updated = await appClient.entities.Order.update(orderId, data);
    setSelectedOrder(updated);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    return updated;
  };

  const searchLower = searchTerm.trim().toLowerCase();
  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      !searchLower ||
      order.order_number?.toLowerCase().includes(searchLower) ||
      order.customer_order_number?.toLowerCase().includes(searchLower) ||
      order.license_plate?.toLowerCase().includes(searchLower) ||
      order.vehicle_brand?.toLowerCase().includes(searchLower) ||
      order.vehicle_model?.toLowerCase().includes(searchLower) ||
      order.vin?.toLowerCase().includes(searchLower) ||
      order.pickup_address?.toLowerCase().includes(searchLower) ||
      order.pickup_city?.toLowerCase().includes(searchLower) ||
      order.pickup_postal_code?.toLowerCase().includes(searchLower) ||
      order.dropoff_address?.toLowerCase().includes(searchLower) ||
      order.dropoff_city?.toLowerCase().includes(searchLower) ||
      order.dropoff_postal_code?.toLowerCase().includes(searchLower) ||
      order.customer_name?.toLowerCase().includes(searchLower) ||
      order.assigned_driver_name?.toLowerCase().includes(searchLower);
    
    const matchesListMode =
      listMode === 'completed' ? order.status === 'completed' : order.status !== 'completed';
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    const matchesDriver =
      driverFilter === 'all' || order.assigned_driver_id === driverFilter;
    
    return matchesSearch && matchesStatus && matchesListMode && matchesDriver;
  });


  const getDueStatus = (order) => {
    const dueAt = getDueDateTime(order);
    if (!dueAt) {
      return { state: 'normal', label: '-', detail: '' };
    }
    const now = new Date();
    const tomorrow = addDays(now, 1);
    if (dueAt.getTime() < now.getTime()) {
      const days = Math.max(1, differenceInCalendarDays(now, dueAt));
      return {
        state: 'overdue',
        label: format(dueAt, 'dd.MM.yyyy HH:mm', { locale: de }),
        detail: `Überfällig seit ${days} Tag${days > 1 ? 'en' : ''}`,
      };
    }
    if (isSameDay(dueAt, now) || isSameDay(dueAt, tomorrow)) {
      return {
        state: 'today',
        label: format(dueAt, 'dd.MM.yyyy HH:mm', { locale: de }),
        detail: isSameDay(dueAt, now) ? 'Heute fällig' : 'Morgen fällig',
      };
    }
    return {
      state: 'normal',
      label: format(dueAt, 'dd.MM.yyyy HH:mm', { locale: de }),
      detail: '',
    };
  };

  const latestNotesByOrder = useMemo(() => {
    const map = {};
    orderNotes.forEach((note) => {
      if (!note?.order_id) return;
      if (!map[note.order_id]) {
        map[note.order_id] = note;
      }
    });
    return map;
  }, [orderNotes]);

  useEffect(() => {
    const availableIds = new Set(orders.map((order) => order.id));
    setSelectedIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [orders]);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(filteredOrders.map((order) => order.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
  };

  const selectedOrders = filteredOrders.filter((order) => selectedIds.includes(order.id));
  const allSelected = selectedOrders.length > 0 && selectedOrders.length === filteredOrders.length;
  const someSelected = selectedOrders.length > 0 && !allSelected;

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      for (const id of selectedIds) {
        await appClient.entities.Order.delete(id);
      }
      setBulkMessage('Aufträge wurden gelöscht.');
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setBulkDeleteOpen(false);
    } catch (err) {
      setBulkError(err?.message || 'Bulk-Löschen fehlgeschlagen.');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkDuplicate = async () => {
    if (!selectedOrders.length) return;
    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      for (const order of selectedOrders) {
        const {
          id,
          order_number,
          status,
          created_date,
          updated_date,
          review_checks,
          review_notes,
          status_override_reason,
          assigned_driver_id,
          assigned_driver_name,
          pdf_url,
          ...rest
        } = order;
        await appClient.entities.Order.create({
          ...rest,
          customer_id: rest.customer_id || null,
          status: 'new',
          assigned_driver_id: null,
          assigned_driver_name: '',
        });
      }
      setBulkMessage('Aufträge wurden dupliziert.');
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      setBulkError(err?.message || 'Bulk-Duplizieren fehlgeschlagen.');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleNoteChange = (orderId, value) => {
    setNoteDrafts((prev) => ({ ...prev, [orderId]: value }));
  };

  const handleNoteSave = async (orderId) => {
    const note = (noteDrafts[orderId] || '').trim();
    if (!note || !currentUser) return;
    setNoteSaving((prev) => ({ ...prev, [orderId]: true }));
    setNoteErrors((prev) => ({ ...prev, [orderId]: '' }));
    try {
      await appClient.entities.OrderNote.create({
        order_id: orderId,
        author_user_id: currentUser.id,
        author_name: currentUser.full_name || '',
        author_email: currentUser.email || '',
        note,
        is_pinned: false,
      });
      setNoteDrafts((prev) => ({ ...prev, [orderId]: '' }));
      setNoteOpen((prev) => ({ ...prev, [orderId]: false }));
      queryClient.invalidateQueries({ queryKey: ['order-notes'] });
    } catch (err) {
      setNoteErrors((prev) => ({
        ...prev,
        [orderId]: err?.message || 'Notiz konnte nicht gespeichert werden.',
      }));
    } finally {
      setNoteSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleNoteEditStart = (note) => {
    if (!note?.id) return;
    setNoteEditOpen((prev) => ({ ...prev, [note.order_id]: true }));
    setNoteEditDrafts((prev) => ({ ...prev, [note.order_id]: note.note || '' }));
  };

  const handleNoteEditSave = async (note) => {
    if (!note?.id) return;
    const updatedText = (noteEditDrafts[note.order_id] || '').trim();
    if (!updatedText) return;
    setNoteEditSaving((prev) => ({ ...prev, [note.order_id]: true }));
    setNoteErrors((prev) => ({ ...prev, [note.order_id]: '' }));
    try {
      await appClient.entities.OrderNote.update(note.id, { note: updatedText });
      setNoteEditOpen((prev) => ({ ...prev, [note.order_id]: false }));
      queryClient.invalidateQueries({ queryKey: ['order-notes'] });
    } catch (err) {
      setNoteErrors((prev) => ({
        ...prev,
        [note.order_id]: err?.message || 'Notiz konnte nicht gespeichert werden.',
      }));
    } finally {
      setNoteEditSaving((prev) => ({ ...prev, [note.order_id]: false }));
    }
  };

  const handleNoteDelete = async (note) => {
    if (!note?.id) return;
    const confirmed = window.confirm('Notiz wirklich löschen?');
    if (!confirmed) return;
    setNoteErrors((prev) => ({ ...prev, [note.order_id]: '' }));
    try {
      await appClient.entities.OrderNote.delete(note.id);
      queryClient.invalidateQueries({ queryKey: ['order-notes'] });
    } catch (err) {
      setNoteErrors((prev) => ({
        ...prev,
        [note.order_id]: err?.message || 'Notiz konnte nicht gelöscht werden.',
      }));
    }
  };

  const getOrderChecklists = (orderId) => {
    return checklists.filter(c => c.order_id === orderId);
  };

  // Form View
  if (view === 'form') {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>
        <OrderForm 
          order={selectedOrder}
          currentUser={currentUser}
          onSave={handleSave}
          onCancel={() => {
            setView('list');
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        />
      </div>
    );
  }

  // Details View
  if (view === 'details' && selectedOrder) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>
        <OrderDetails 
          order={selectedOrder}
          checklists={getOrderChecklists(selectedOrder.id)}
          drivers={drivers}
          currentUser={currentUser}
          onAssignDriver={handleAssignDriver}
          onStatusUpdate={handleStatusUpdate}
          onEdit={() => setView('form')}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Auftrag löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du den Auftrag {selectedOrder.order_number} wirklich löschen? 
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedOrder.id)}
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aufträge</h1>
          <p className="text-gray-500">{orders.length} Aufträge insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => window.location.href = createPageUrl('AIImport')}
          >
            <Truck className="w-4 h-4 mr-2" />
            AI Import
          </Button>
          <Button 
            className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            onClick={() => {
              storeListScroll();
              setSelectedOrder(null);
              setView('form');
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Neuer Auftrag
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={listMode === 'active' ? 'default' : 'outline'}
          className={listMode === 'active' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
          onClick={() => handleListModeChange('active')}
        >
          Aktive Aufträge ({activeOrdersCount})
        </Button>
        <Button
          variant={listMode === 'completed' ? 'default' : 'outline'}
          className={listMode === 'completed' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
          onClick={() => handleListModeChange('completed')}
        >
          Abgeschlossene Aufträge ({completedOrdersCount})
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Offen</p>
            <p className="text-2xl font-semibold text-slate-900">{summaryCounts.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">In Lieferung</p>
            <p className="text-2xl font-semibold text-slate-900">{summaryCounts.inDelivery}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Noch 1 Tag</p>
            <p className="text-2xl font-semibold text-slate-900">{summaryCounts.dueTomorrow}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Überfällig</p>
            <p className="text-2xl font-semibold text-red-600">{summaryCounts.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Suche nach Auftragsnummer, Kunde, Kennzeichen, Ort, PLZ, Straße..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {listMode === 'active' ? (
                  <>
                    <SelectItem value="new">Offen</SelectItem>
                    <SelectItem value="assigned">Zugewiesen</SelectItem>
                    <SelectItem value="pickup_started">Übernahme läuft</SelectItem>
                    <SelectItem value="in_transit">In Lieferung</SelectItem>
                    <SelectItem value="delivery_started">Übergabe läuft</SelectItem>
                    <SelectItem value="review">Prüfung</SelectItem>
                    <SelectItem value="ready_for_billing">Freigabe Abrechnung</SelectItem>
                    <SelectItem value="approved">Freigegeben</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </>
                ) : (
                  <SelectItem value="completed">Erfolgreich beendet</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Fahrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Fahrer</SelectItem>
                {drivers.map((driver) => {
                  const label =
                    driver.name ||
                    [driver.first_name, driver.last_name].filter(Boolean).join(' ') ||
                    driver.email ||
                    'Fahrer';
                  return (
                    <SelectItem key={driver.id} value={driver.id}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>


      {selectedIds.length > 0 && (
        <Card className="border border-slate-200 bg-slate-50">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              {selectedIds.length} Auftrag/‑träge ausgewählt
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleBulkDuplicate}
                disabled={bulkWorking}
              >
                Duplizieren
              </Button>
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkWorking}
              >
                Löschen
              </Button>
              <Button variant="ghost" onClick={() => setSelectedIds([])} disabled={bulkWorking}>
                Auswahl löschen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {bulkError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {bulkError}
        </div>
      )}
      {bulkMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {bulkMessage}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Keine Aufträge gefunden</p>
              {searchTerm || statusFilter !== 'all' ? (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Filter zurücksetzen
                </Button>
              ) : (
                <Button 
                  className="mt-4 bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={() => setView('form')}
                >
                  Ersten Auftrag erstellen
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto touch-pan-x">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected || (someSelected ? "indeterminate" : false)}
                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </TableHead>
                    <TableHead>Auftrag</TableHead>
                    <TableHead>Fahrzeug</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Fahrer</TableHead>
                  <TableHead>Auslagen</TableHead>
                  <TableHead>Fällig bis</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {filteredOrders.map((order) => {
                    const dueStatus = getDueStatus(order);
                    const isCompleted = order.status === 'completed';
                    const rowTone = isCompleted
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : dueStatus.state === 'overdue'
                      ? 'bg-red-50 hover:bg-red-100'
                      : dueStatus.state === 'today'
                      ? 'bg-yellow-50 hover:bg-yellow-100'
                      : 'bg-green-50 hover:bg-green-100';
                    const dueDetail = isCompleted ? null : dueStatus.detail;
                    return (
                    <TableRow 
                      key={order.id}
                      className={`cursor-pointer ${rowTone}`}
                      onClick={() => {
                        storeListScroll();
                        setSelectedOrder(order);
                        setView('details');
                        window.history.pushState({}, '', createPageUrl('Orders') + `?id=${order.id}`);
                      }}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(order.id)}
                          onCheckedChange={(checked) => toggleSelect(order.id, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-[#1e3a5f]">{order.order_number}</p>
                          <p className="text-sm text-gray-500">{order.license_plate}</p>
                          {latestNotesByOrder[order.id]?.note && (
                            <div
                              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                                <span>Interne Notiz</span>
                                <div className="flex items-center gap-2 normal-case text-[11px] text-slate-500">
                                  <button
                                    type="button"
                                    className="hover:text-slate-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleNoteEditStart(latestNotesByOrder[order.id]);
                                    }}
                                  >
                                    Bearbeiten
                                  </button>
                                  <button
                                    type="button"
                                    className="hover:text-red-600"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleNoteDelete(latestNotesByOrder[order.id]);
                                    }}
                                  >
                                    Löschen
                                  </button>
                                </div>
                              </div>
                              {noteEditOpen[order.id] ? (
                                <div
                                  className="mt-2 space-y-2"
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                >
                                  <Textarea
                                    rows={2}
                                    value={noteEditDrafts[order.id] || ''}
                                    onChange={(e) =>
                                      setNoteEditDrafts((prev) => ({
                                        ...prev,
                                        [order.id]: e.target.value,
                                      }))
                                    }
                                    className="text-xs"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                                      disabled={
                                        noteEditSaving[order.id] ||
                                        !noteEditDrafts[order.id]?.trim()
                                      }
                                      onClick={() =>
                                        handleNoteEditSave(latestNotesByOrder[order.id])
                                      }
                                    >
                                      {noteEditSaving[order.id] ? (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                      ) : null}
                                      Speichern
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setNoteEditOpen((prev) => ({
                                          ...prev,
                                          [order.id]: false,
                                        }))
                                      }
                                    >
                                      Abbrechen
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                                  {latestNotesByOrder[order.id].note}
                                </p>
                              )}
                            </div>
                          )}
                          <div
                            className="mt-3 flex flex-col gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {!noteOpen[order.id] ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setNoteOpen((prev) => ({ ...prev, [order.id]: true }))
                                }
                              >
                                Notiz hinzufügen
                              </Button>
                            ) : (
                              <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <Textarea
                                  rows={2}
                                  value={noteDrafts[order.id] || ''}
                                  onChange={(e) => handleNoteChange(order.id, e.target.value)}
                                  placeholder="Interne Notiz hinzufügen..."
                                  className="text-xs"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                                    disabled={noteSaving[order.id] || !noteDrafts[order.id]?.trim()}
                                    onClick={() => handleNoteSave(order.id)}
                                  >
                                    {noteSaving[order.id] ? (
                                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    ) : null}
                                    Notiz speichern
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setNoteOpen((prev) => ({ ...prev, [order.id]: false }))
                                    }
                                  >
                                    Schließen
                                  </Button>
                                  {noteErrors[order.id] && (
                                    <span className="text-xs text-red-600">{noteErrors[order.id]}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
                          <p className="text-sm text-gray-500">{order.vehicle_color}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{order.pickup_city || 'N/A'}</p>
                          <p className="text-gray-400">→</p>
                          <p>{order.dropoff_city || 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.assigned_driver_name || (
                          <span className="text-gray-400">Nicht zugewiesen</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {expensesByOrder[order.id] ? (
                          <Check className="h-5 w-5 text-emerald-600" aria-label="Auslagen vorhanden" />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">
                          {dueStatus.label}
                        </div>
                        {dueDetail && (
                          <div className={`text-xs ${
                            dueStatus.state === 'overdue'
                              ? 'text-red-700'
                              : dueStatus.state === 'today'
                              ? 'text-yellow-700'
                              : 'text-green-700'
                          }`}>
                            {dueDetail}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufträge löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du die ausgewählten Aufträge wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleBulkDelete}
              disabled={bulkWorking}
            >
              {bulkWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
