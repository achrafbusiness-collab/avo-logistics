import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { TableSkeleton } from "@/components/ui/page-skeletons";
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StatusBadge from '@/components/ui/StatusBadge';
import OrderForm from '@/components/orders/OrderForm';
import OrderDetails from '@/components/orders/OrderDetails';
import { getPriceForDistance } from '@/utils/priceList';
import { getMapboxDistanceKm } from '@/utils/mapboxDistance';
import { upsertInvoiceDraft } from '@/utils/invoiceStorage';
import { useToast } from "@/components/ui/use-toast";
import { 
  Plus, 
  Search, 
  Filter,
  Truck,
  Check,
  X,
  ArrowLeft,
  Loader2,
  Mail,
  Download,
  Trash2,
  RotateCcw,
  CheckSquare,
} from 'lucide-react';

const DELIVERY_MAIN_STATUS = 'in_transit';
const IN_DELIVERY_STATUSES = new Set([DELIVERY_MAIN_STATUS, 'shuttle', 'zwischenabgabe']);
const PAGE_SIZE = 30;
const EXPENSE_TYPE_LABELS = {
  fuel: 'Betankung',
  ticket: 'Ticket',
  taxi: 'Taxikosten',
  toll: 'Maut',
  additional_protocol: 'Protokoll',
};
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};
const CHECKLIST_SELECT_FIELDS = 'id,order_id,type,completed,datetime,location,location_confirmed,location_reason,expenses,created_date,updated_date';
const CHECKLIST_QUERY_PAGE_SIZE = 1000;
const CHECKLIST_ORDER_CHUNK_SIZE = 100;

const chunkArray = (items, size) => {
  const result = [];
  if (!Array.isArray(items) || size <= 0) return result;
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const fetchChecklistsForOrderIds = async (orderIds) => {
  const uniqueOrderIds = [...new Set((orderIds || []).filter(Boolean))];
  if (!uniqueOrderIds.length) return [];
  const result = [];
  const orderChunks = chunkArray(uniqueOrderIds, CHECKLIST_ORDER_CHUNK_SIZE);
  for (const orderIdChunk of orderChunks) {
    let from = 0;
    while (true) {
      const to = from + CHECKLIST_QUERY_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('checklists')
        .select(CHECKLIST_SELECT_FIELDS)
        .in('order_id', orderIdChunk)
        .order('updated_date', { ascending: false, nullsFirst: false })
        .range(from, to);
      if (error) {
        throw new Error(error.message || 'Checklist-Abfrage fehlgeschlagen.');
      }
      const rows = data || [];
      result.push(...rows);
      if (rows.length < CHECKLIST_QUERY_PAGE_SIZE) break;
      from += CHECKLIST_QUERY_PAGE_SIZE;
    }
  }
  return result;
};

const sanitizeFileNamePart = (value, maxLength = 60) => {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
};

const formatExpenseDateLabel = (checklist, order) => {
  const rawDate =
    checklist?.datetime ||
    checklist?.created_date ||
    order?.dropoff_date ||
    order?.created_date ||
    null;
  if (!rawDate) return '';
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const dateOnly = new Date(`${rawDate}T12:00:00`);
    if (Number.isNaN(dateOnly.getTime())) return '';
    return format(dateOnly, 'dd.MM.yyyy', { locale: de });
  }
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'dd.MM.yyyy', { locale: de });
};

const formatExpenseAmountLabel = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return sanitizeFileNamePart(value, 20);
  }
  return `${parsed.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}EUR`;
};

const getExpenseExtension = (expense, blobType = '') => {
  const fromName = String(expense?.file_name || '').match(/\.([a-zA-Z0-9]{1,8})$/);
  if (fromName?.[1]) return fromName[1].toLowerCase();
  const fromUrl = String(expense?.file_url || '').match(/\.([a-zA-Z0-9]{1,8})(?:[?#]|$)/);
  if (fromUrl?.[1]) return fromUrl[1].toLowerCase();
  const mime = String(blobType || expense?.file_type || '').toLowerCase();
  return MIME_EXTENSION_MAP[mime] || '';
};

const triggerDownload = (href, fileName) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const BILLING_OVERRIDE_PREFIX = 'billing_override::';

const roundCurrency = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
};

const encodeBillingOverride = (payload) =>
  `${BILLING_OVERRIDE_PREFIX}${JSON.stringify(payload || {})}`;

const parseBillingOverride = (order) => {
  const raw = String(order?.status_override_reason || '').trim();
  if (!raw.startsWith(BILLING_OVERRIDE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(BILLING_OVERRIDE_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const formatBillingOverrideLabel = (override) => {
  if (!override?.type) return '';
  if (override.type === 'storno') return 'Storno (nicht berechnet)';
  if (override.type === 'leerfahrt') {
    if (override.mode === 'percent') {
      const percent = Number.parseFloat(override.percent);
      if (Number.isFinite(percent) && percent >= 0) {
        return `Leerfahrt (${percent.toLocaleString('de-DE')}%)`;
      }
    }
    if (override.mode === 'flat') {
      return 'Leerfahrt (pauschal)';
    }
    return 'Leerfahrt';
  }
  return '';
};

export default function Orders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  useRealtimeSync('orders', ['orders', 'orders-trashed']);
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list'); // list, form, details
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [listMode, setListMode] = useState('active');
  const [driverFilter, setDriverFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [expensesFilter, setExpensesFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const [dueSort, setDueSort] = useState('desc');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkAssignCustomerOpen, setBulkAssignCustomerOpen] = useState(false);
  const [bulkCustomerBillingOpen, setBulkCustomerBillingOpen] = useState(false);
  const [bulkStornoLeerfahrtOpen, setBulkStornoLeerfahrtOpen] = useState(false);
  const [bulkCustomerId, setBulkCustomerId] = useState('none');
  const [stornoLeerfahrtType, setStornoLeerfahrtType] = useState('storno');
  const [leerfahrtCalcMode, setLeerfahrtCalcMode] = useState('percent');
  const [leerfahrtPercent, setLeerfahrtPercent] = useState('50');
  const [leerfahrtFlatAmount, setLeerfahrtFlatAmount] = useState('');
  const [invoiceCustomerPickerOpen, setInvoiceCustomerPickerOpen] = useState(false);
  const [invoicePickerCustomerKey, setInvoicePickerCustomerKey] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkBillingExporting, setBulkBillingExporting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [noteSaving, setNoteSaving] = useState({});
  const [noteErrors, setNoteErrors] = useState({});
  const [noteOpen, setNoteOpen] = useState({});
  const [noteEditOpen, setNoteEditOpen] = useState({});
  const [noteEditDrafts, setNoteEditDrafts] = useState({});
  const [noteEditSaving, setNoteEditSaving] = useState({});
  const [reviewSaving, setReviewSaving] = useState({});
  const listScrollTopRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);

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

  const getOrderDetailsScrollKey = (orderId) =>
    `scroll:admin:${createPageUrl('Orders')}?id=${orderId}`;

  const scrollOrderDetailsToTop = (orderId) => {
    const node = getScrollContainer();
    if (!node) return;
    if (orderId) {
      sessionStorage.setItem(getOrderDetailsScrollKey(orderId), '0');
    }
    requestAnimationFrame(() => {
      node.scrollTop = 0;
    });
  };

  const openOrderDetails = async (order) => {
    if (!order?.id) return;
    storeListScroll();
    setSelectedOrder(order);
    setView('details');
    window.history.pushState({}, '', createPageUrl('Orders') + `?id=${order.id}`);
    scrollOrderDetailsToTop(order.id);
    // Frische Daten aus Supabase holen um sicherzustellen, dass alle Felder vorhanden sind
    const { data: fresh } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order.id)
      .single();
    if (fresh) {
      setSelectedOrder(fresh);
      // Cache aktualisieren
      queryClient.setQueryData(['orders'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((o) => (o.id === fresh.id ? fresh : o));
      });
    }
  };

  useEffect(() => {
    if (view === 'list') {
      restoreListScroll();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });
  const appSettings = appSettingsList[0] || null;

  useEffect(() => {
    if (!currentUser || maintenanceChecked) return;
    const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
    const isSystemAdmin = (user) => {
      const adminEmail = import.meta.env.VITE_SYSTEM_ADMIN_EMAIL;
      const adminUserId = import.meta.env.VITE_SYSTEM_ADMIN_USER_ID;
      if (adminUserId && user.id === adminUserId) return true;
      if (adminEmail && normalizeEmail(user.email) === normalizeEmail(adminEmail)) return true;
      return false;
    };
    const canRun = currentUser.role === 'admin' || isSystemAdmin(currentUser);
    if (!canRun) {
      setMaintenanceChecked(true);
      return;
    }
    const companyKey = currentUser.company_id || currentUser.id || 'global';
    const statusFixStorageKey = `tf:fix-intransit-no-driver:v5:${companyKey}`;
    const expenseRestoreStorageKey = `tf:restore-checklist-expenses:v1:${companyKey}`;
    let cancelled = false;
    (async () => {
      try {
        let needsRefresh = false;
        if (
          typeof window !== 'undefined' &&
          window.localStorage.getItem(statusFixStorageKey) !== 'done'
        ) {
          try {
            const result = await appClient.maintenance.fixInTransitWithoutDriver();
            if (cancelled) return;
            window.localStorage.setItem(statusFixStorageKey, 'done');
            if (result?.updated) {
              needsRefresh = true;
            }
          } catch {
            // Background maintenance – silent fail
          }
        }

        if (
          typeof window !== 'undefined' &&
          window.localStorage.getItem(expenseRestoreStorageKey) !== 'done'
        ) {
          try {
            const result = await appClient.maintenance.restoreChecklistExpenses({
              sinceDays: 180,
            });
            if (cancelled) return;
            window.localStorage.setItem(expenseRestoreStorageKey, 'done');
            if (result?.updated) {
              needsRefresh = true;
            }
          } catch {
            // Background maintenance – silent fail
          }
        }

        if (needsRefresh) {
          queryClient.invalidateQueries({ queryKey: ['checklists'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      } finally {
        if (!cancelled) setMaintenanceChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, maintenanceChecked, queryClient]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .is('deleted_at', null)
        .order('created_date', { ascending: false })
        .limit(500);
      if (error) return [];
      return data || [];
    },
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: trashedOrders = [] } = useQuery({
    queryKey: ['orders-trashed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(200);
      if (error) return [];
      return data || [];
    },
  });
  const orderIdsForChecklistQuery = useMemo(
    () => [...new Set((orders || []).map((order) => order?.id).filter(Boolean))],
    [orders]
  );

  const { data: orderNotes = [] } = useQuery({
    queryKey: ['order-notes'],
    queryFn: () =>
      appClient.entities.OrderNote.list(
        '-created_at',
        500,
        'id,order_id,note,created_at,created_date,author_name,author_email'
      ),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists', orderIdsForChecklistQuery],
    queryFn: async () => {
      try {
        return await fetchChecklistsForOrderIds(orderIdsForChecklistQuery);
      } catch {
        toast({ title: 'Checklisten konnten nicht geladen werden', description: 'Bitte Seite neu laden.', variant: 'destructive' });
        return [];
      }
    },
    enabled: orderIdsForChecklistQuery.length > 0,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () =>
      appClient.entities.Driver.filter(
        { status: 'active' },
        '-created_date',
        500,
        'id,first_name,last_name,email'
      ),
  });

  const { data: pendingPriceSegments = [] } = useQuery({
    queryKey: ['driver-price-requests-count'],
    queryFn: () =>
      appClient.entities.OrderSegment.filter(
        { price_status: 'pending' },
        '-created_date',
        500,
        'id'
      ),
  });

  const { data: deliverySegments = [] } = useQuery({
    queryKey: ['order-delivery-substatus'],
    queryFn: () =>
      appClient.entities.OrderSegment.list(
        '-created_date',
        5000,
        'id,order_id,segment_type'
      ),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () =>
      appClient.entities.Customer.list(
        '-created_date',
        500,
        'id,customer_number,type,company_name,first_name,last_name,email,phone,address,postal_code,city,country,tax_id,price_list'
      ),
  });

  const getDueDateTime = (order) => {
    if (!order?.dropoff_date) return null;
    const time = order.dropoff_time ? `${order.dropoff_time}:00` : '23:59:00';
    const date = new Date(`${order.dropoff_date}T${time}`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const parseOrderDateTime = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dateOnly = new Date(`${value}T12:00:00`);
      return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getOrderFilterDateTime = (order) =>
    parseOrderDateTime(order?.dropoff_date) ||
    parseOrderDateTime(order?.pickup_date) ||
    parseOrderDateTime(order?.created_date);

  const summaryCounts = useMemo(() => {
    const now = new Date();
    const tomorrow = addDays(now, 1);
    let open = 0;
    let inDelivery = 0;
    let dueTomorrow = 0;
    let overdue = 0;

    orders.forEach((order) => {
      if (order.status === 'cancelled') return;
      if (IN_DELIVERY_STATUSES.has(order.status)) {
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

  const getMainOrderStatus = (status) =>
    status === 'shuttle' || status === 'zwischenabgabe' ? DELIVERY_MAIN_STATUS : status;

  const latestDeliverySubstatusByOrder = useMemo(() => {
    const map = {};
    const setLatest = (orderId, substatus) => {
      if (!orderId || map[orderId]) return;
      map[orderId] = substatus;
    };

    deliverySegments.forEach((segment) => {
      if (!segment?.order_id) return;
      if (segment.segment_type === 'shuttle') {
        setLatest(segment.order_id, 'shuttle');
      } else if (segment.segment_type === 'handoff') {
        setLatest(segment.order_id, 'zwischenabgabe');
      }
    });

    // Legacy-Fallback: falls kein Segment vorhanden ist, alten Status als Unterstatus zeigen.
    orders.forEach((order) => {
      if (!order?.id || map[order.id]) return;
      if (order.status === 'shuttle') map[order.id] = 'shuttle';
      if (order.status === 'zwischenabgabe') map[order.id] = 'zwischenabgabe';
    });

    return map;
  }, [deliverySegments, orders]);

  const getLatestDeliverySubstatus = (order) => {
    if (!order?.id || !IN_DELIVERY_STATUSES.has(order?.status)) return [];
    const status = latestDeliverySubstatusByOrder[order.id];
    return status ? [status] : [];
  };

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

  const fuelExpensesByOrder = useMemo(() => {
    const map = {};
    checklists.forEach((checklist) => {
      const orderId = checklist?.order_id;
      if (!orderId || !Array.isArray(checklist?.expenses)) return;
      const sum = checklist.expenses.reduce((acc, expense) => {
        if (expense?.type !== 'fuel') return acc;
        const value = Number.parseFloat(String(expense?.amount ?? '').replace(',', '.'));
        return Number.isFinite(value) ? acc + value : acc;
      }, 0);
      if (sum > 0) {
        map[orderId] = (map[orderId] || 0) + sum;
      }
    });
    return map;
  }, [checklists]);

  const activeOrdersCount = useMemo(
    () => orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length,
    [orders]
  );
  const completedOrdersCount = useMemo(
    () => orders.filter((order) => order.status === 'completed' || order.status === 'cancelled').length,
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
    setDueFilter('all');
    if (nextMode === 'completed') {
      setStatusFilter('all');
    } else if (statusFilter === 'completed' || statusFilter === 'cancelled') {
      setStatusFilter('all');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Order.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-trashed'] });
      setView('list');
      setSelectedOrder(null);
      setDeleteConfirmOpen(false);
    },
  });

  const restoreOrderMutation = useMutation({
    mutationFn: (id) => appClient.entities.Order.update(id, { deleted_at: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-trashed'] });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-trashed'] });
    },
  });

  // Handle URL params
  useEffect(() => {
    const listParam = urlParams.get('list');
    if (listParam === 'active' || listParam === 'completed') {
      setListMode(listParam);
    }
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedOrder(null);
    } else if (urlParams.get('id')) {
      const orderId = urlParams.get('id');
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
        setView('details');
        scrollOrderDetailsToTop(order.id);
        // Frische Daten nachladen
        supabase.from('orders').select('*').eq('id', orderId).single().then(({ data: fresh }) => {
          if (fresh) {
            setSelectedOrder(fresh);
            queryClient.setQueryData(['orders'], (old) => {
              if (!Array.isArray(old)) return old;
              return old.map((o) => (o.id === fresh.id ? fresh : o));
            });
          }
        });
      }
    }
    if (urlParams.get('status')) {
      setStatusFilter(getMainOrderStatus(urlParams.get('status')));
    }
    const dueParam = urlParams.get('due');
    setDueFilter(dueParam || 'all');
    setDateFromFilter(urlParams.get('dateFrom') || '');
    setDateToFilter(urlParams.get('dateTo') || '');
    const customerParam = urlParams.get('customerId');
    if (customerParam) {
      setCustomerFilter(customerParam);
    } else {
      setCustomerFilter('all');
    }
  }, [urlParams.toString(), orders]);

  useEffect(() => {
    if (view !== 'details' || !selectedOrder?.id) return;
    scrollOrderDetailsToTop(selectedOrder.id);
  }, [view, selectedOrder?.id]);

  const handleSave = async (data) => {
    const normalizeOrderPayload = (payload) => {
      const normalized = { ...payload };
      if (normalized.assigned_driver_id === '') {
        normalized.assigned_driver_id = null;
      }
      if (!normalized.assigned_driver_id) {
        normalized.assigned_driver_name = '';
      }
      if (normalized.assigned_driver_id) {
        const normalizedMainStatus = getMainOrderStatus(normalized.status || '');
        if (!normalizedMainStatus || normalizedMainStatus === 'new') {
          // Fahrer wurde zugewiesen, aber Übernahmeprotokoll noch nicht gestartet.
          normalized.status = 'assigned';
        } else {
          normalized.status = normalizedMainStatus;
        }
      }
      if (!normalized.assigned_driver_id && ['in_transit', 'shuttle', 'zwischenabgabe'].includes(normalized.status)) {
        normalized.status = 'new';
      }
      if (normalized.customer_id === '') {
        normalized.customer_id = null;
      }
      return normalized;
    };

    if (selectedOrder) {
      const previousDriverId = selectedOrder.assigned_driver_id || null;
      const updated = await updateMutation.mutateAsync({
        id: selectedOrder.id,
        data: normalizeOrderPayload(data),
      });
      if (updated?.assigned_driver_id && updated.assigned_driver_id !== previousDriverId) {
        notifyDriverAssignment(updated.id);
      }
    } else {
      const created = await createMutation.mutateAsync(normalizeOrderPayload(data));
      if (created?.assigned_driver_id) {
        notifyDriverAssignment(created.id);
      }
    }
  };

  const notifyDriverAssignment = async (orderId) => {
    try {
      await appClient.notifications.sendDriverAssignment({ orderId });
    } catch {
      toast({ title: 'Benachrichtigung fehlgeschlagen', description: 'Fahrer konnte nicht benachrichtigt werden.', variant: 'destructive' });
    }
  };

  const handleAssignDriver = async (driverId) => {
    if (!selectedOrder) return;
    const previousDriverId = selectedOrder.assigned_driver_id || null;
    const driver = drivers.find(d => d.id === driverId);
    const driverName = driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : '';
    const updates = {
      assigned_driver_id: driverId,
      assigned_driver_name: driverName,
    };
    const selectedStatus = getMainOrderStatus(selectedOrder.status);
    if (driverId) {
      if (!selectedStatus || selectedStatus === 'new') {
        updates.status = 'assigned';
      }
    } else {
      updates.assigned_driver_id = null;
      updates.assigned_driver_name = '';
      if (['assigned', 'in_transit'].includes(selectedStatus)) {
        updates.status = 'new';
      }
    }
    const updated = await appClient.entities.Order.update(selectedOrder.id, updates);
    setSelectedOrder(updated);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    if (driverId && driverId !== previousDriverId) {
      notifyDriverAssignment(updated.id);
    }
  };

  const handleStatusUpdate = async (orderId, data) => {
    // Build status history entry
    const currentOrder = selectedOrder;
    if (currentOrder && data.status && data.status !== currentOrder.status) {
      const historyEntry = {
        from: currentOrder.status,
        to: data.status,
        reason: data.status_override_reason || '',
        at: new Date().toISOString(),
        by: currentUser?.full_name || currentUser?.email || 'System',
      };
      const existingHistory = Array.isArray(currentOrder.status_history) ? currentOrder.status_history : [];
      data.status_history = [...existingHistory, historyEntry];
    }
    const updated = await appClient.entities.Order.update(orderId, data);
    setSelectedOrder(updated);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    return updated;
  };

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.type === 'business' && customer.company_name) {
      return customer.company_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const formatCurrencyValue = (value) =>
    Number(value || 0).toLocaleString('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const filteredOrders = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const dateFromBound = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : null;
    const dateToBound = dateToFilter ? new Date(`${dateToFilter}T23:59:59.999`) : null;

    return orders.filter(order => {
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
        listMode === 'completed'
          ? order.status === 'completed' || order.status === 'cancelled'
          : order.status !== 'completed' && order.status !== 'cancelled';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'in_transit'
          ? IN_DELIVERY_STATUSES.has(order.status)
          : getMainOrderStatus(order.status) === statusFilter);

      const matchesDriver =
        driverFilter === 'all' || order.assigned_driver_id === driverFilter;

      const matchesCustomer = (() => {
        if (customerFilter === 'all') return true;
        if (customerFilter === 'none') return !order.customer_id;
        return order.customer_id === customerFilter;
      })();

      const hasExpenses = Boolean(expensesByOrder[order.id]);
      const matchesExpenses =
        expensesFilter === 'all' ||
        (expensesFilter === 'with' ? hasExpenses : !hasExpenses);

      const dueAt = getDueDateTime(order);
      const orderDateTime = getOrderFilterDateTime(order);
      const now = new Date();
      const tomorrow = addDays(now, 1);
      const matchesDueFilter = (() => {
        if (dueFilter === 'all') return true;
        if (dueFilter === 'overdue') {
          return order.status !== 'completed' && dueAt && dueAt.getTime() < now.getTime();
        }
        if (dueFilter === 'tomorrow') {
          return order.status !== 'completed' && dueAt && isSameDay(dueAt, tomorrow);
        }
        if (dueFilter === 'open') {
          return order.status !== 'completed';
        }
        if (dueFilter === 'in_transit') {
          return IN_DELIVERY_STATUSES.has(order.status);
        }
        return true;
      })();
      const matchesDateRange = (() => {
        if (!dateFromBound && !dateToBound) return true;
        if (!orderDateTime) return false;
        if (dateFromBound && orderDateTime.getTime() < dateFromBound.getTime()) return false;
        if (dateToBound && orderDateTime.getTime() > dateToBound.getTime()) return false;
        return true;
      })();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesListMode &&
        matchesDriver &&
        matchesCustomer &&
        matchesExpenses &&
        matchesDueFilter &&
        matchesDateRange
      );
    });
  }, [orders, searchTerm, dateFromFilter, dateToFilter, listMode, statusFilter, driverFilter, customerFilter, expensesByOrder, expensesFilter, dueFilter]);

  const sortedOrders = useMemo(() => {
    const direction = dueSort === 'asc' ? 1 : -1;
    return [...filteredOrders].sort((a, b) => {
      const aDate = getDueDateTime(a);
      const bDate = getDueDateTime(b);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return (aDate.getTime() - bDate.getTime()) * direction;
    });
  }, [filteredOrders, dueSort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    listMode,
    searchTerm,
    statusFilter,
    driverFilter,
    customerFilter,
    expensesFilter,
    dueFilter,
    dueSort,
    dateFromFilter,
    dateToFilter,
  ]);

  const hasActiveFilters = Boolean(
    searchTerm ||
      statusFilter !== 'all' ||
      driverFilter !== 'all' ||
      customerFilter !== 'all' ||
      expensesFilter !== 'all' ||
      dueFilter !== 'all' ||
      dateFromFilter ||
      dateToFilter
  );

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE));
  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return sortedOrders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [sortedOrders, currentPage]);

  const pageItems = useMemo(() => {
    if (totalPages <= 1) return [{ type: 'page', page: 1, key: 'page-1' }];
    const pages = new Set([1, totalPages]);
    if (totalPages >= 2) pages.add(2);
    [currentPage - 1, currentPage, currentPage + 1].forEach((page) => {
      if (page > 1 && page < totalPages) pages.add(page);
    });
    const sorted = Array.from(pages).sort((a, b) => a - b);
    const items = [];
    let prev = null;
    sorted.forEach((page) => {
      if (prev !== null && page - prev > 1) {
        items.push({ type: 'ellipsis', key: `ellipsis-${prev}-${page}` });
      }
      items.push({ type: 'page', page, key: `page-${page}` });
      prev = page;
    });
    return items;
  }, [currentPage, totalPages]);

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
  const selectedOrdersBaseTotal = useMemo(
    () =>
      selectedOrders.reduce((sum, order) => {
        const price = Number.parseFloat(order.driver_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0),
    [selectedOrders]
  );
  const stornoLeerfahrtPreviewTotal = useMemo(() => {
    if (!selectedOrders.length) return 0;
    if (stornoLeerfahrtType === 'storno') return 0;
    if (leerfahrtCalcMode === 'flat') {
      const flatAmount = Number.parseFloat(String(leerfahrtFlatAmount || '').replace(',', '.'));
      if (!Number.isFinite(flatAmount) || flatAmount < 0) return 0;
      return roundCurrency(flatAmount * selectedOrders.length);
    }
    const percent = Number.parseFloat(String(leerfahrtPercent || '').replace(',', '.'));
    if (!Number.isFinite(percent) || percent < 0) return 0;
    return roundCurrency((selectedOrdersBaseTotal * percent) / 100);
  }, [
    selectedOrders,
    selectedOrdersBaseTotal,
    stornoLeerfahrtType,
    leerfahrtCalcMode,
    leerfahrtPercent,
    leerfahrtFlatAmount,
  ]);

  const customerLookupById = useMemo(() => {
    const map = new Map();
    customers.forEach((customer) => {
      map.set(customer.id, customer);
    });
    return map;
  }, [customers]);

  const getOrderCustomerKey = (order) => order.customer_id || '__none__';

  const getOrderCustomerLabel = (order) => {
    if (order?.customer_id) {
      const customer = customerLookupById.get(order.customer_id);
      if (customer) {
        return (
          getCustomerDisplayName(customer) ||
          customer.email ||
          order.customer_name?.trim() ||
          'Kunde'
        );
      }
    }
    return order?.customer_name?.trim() || 'Ohne Kunde';
  };

  const customerBillingRows = useMemo(() => {
    const formatRoute = (order) => {
      const pickup = [order.pickup_address, order.pickup_postal_code, order.pickup_city]
        .filter(Boolean)
        .join(', ');
      const dropoff = [order.dropoff_address, order.dropoff_postal_code, order.dropoff_city]
        .filter(Boolean)
        .join(', ');
      return `${pickup || '-'} -> ${dropoff || '-'}`;
    };
    const getOrderDate = (order) => {
      const raw = order.dropoff_date || order.pickup_date || order.created_date;
      if (!raw) return null;
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parsed = new Date(`${raw}T12:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    return selectedOrders.map((order) => {
      const orderDate = getOrderDate(order);
      const orderPrice = Number.parseFloat(order.driver_price);
      const fuelExpenses = Number.parseFloat(fuelExpensesByOrder[order.id] || 0);
      const orderPriceSafe = Number.isFinite(orderPrice) ? orderPrice : 0;
      const fuelExpensesSafe = Number.isFinite(fuelExpenses) ? fuelExpenses : 0;
      const billingOverride = parseBillingOverride(order);
      const billingLabel = formatBillingOverrideLabel(billingOverride);
      const customerKey = getOrderCustomerKey(order);
      const customerLabel = getOrderCustomerLabel(order);
      return {
        id: order.id,
        customerKey,
        customerLabel,
        orderNumber: order.order_number || '-',
        billingType: billingOverride?.type || '',
        billingLabel,
        date: orderDate,
        dateLabel: orderDate ? format(orderDate, 'dd.MM.yyyy', { locale: de }) : '-',
        pickupAddress: [order.pickup_address, order.pickup_postal_code, order.pickup_city]
          .filter(Boolean)
          .join(', ') || '-',
        dropoffAddress: [order.dropoff_address, order.dropoff_postal_code, order.dropoff_city]
          .filter(Boolean)
          .join(', ') || '-',
        route: formatRoute(order),
        vehicle: [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(' ') || '-',
        plate: order.license_plate || '-',
        orderPrice: orderPriceSafe,
        fuelExpenses: fuelExpensesSafe,
        total: orderPriceSafe + fuelExpensesSafe,
      };
    });
  }, [selectedOrders, fuelExpensesByOrder, customerLookupById]);

  const customerBillingCustomers = useMemo(() => {
    const grouped = new Map();
    customerBillingRows.forEach((row) => {
      if (!grouped.has(row.customerKey)) {
        grouped.set(row.customerKey, {
          key: row.customerKey,
          label: row.customerLabel || 'Kunde',
          orderCount: 0,
        });
      }
      grouped.get(row.customerKey).orderCount += 1;
    });
    return Array.from(grouped.values()).sort((a, b) =>
      (a.label || '').localeCompare(b.label || '', 'de')
    );
  }, [customerBillingRows]);

  const customerBillingSummary = useMemo(() => {
    const uniqueCustomers = Array.from(
      new Set(
        customerBillingRows.map((row) => row.customerLabel?.trim()).filter(Boolean)
      )
    );
    const customerLabel =
      uniqueCustomers.length === 0
        ? 'Ohne Kunde'
        : uniqueCustomers.length === 1
          ? uniqueCustomers[0]
          : `Mehrere Kunden (${uniqueCustomers.length})`;
    const orderTotal = customerBillingRows.reduce((acc, row) => acc + row.orderPrice, 0);
    const fuelTotal = customerBillingRows.reduce((acc, row) => acc + row.fuelExpenses, 0);
    return {
      customerLabel,
      orderCount: customerBillingRows.length,
      orderTotal,
      fuelTotal,
      grandTotal: orderTotal + fuelTotal,
    };
  }, [customerBillingRows]);

  const exportCustomerBillingExcel = async () => {
    if (!customerBillingRows.length) return;
    setBulkBillingExporting(true);
    setBulkError('');
    try {
      const xlsxModule = await import('xlsx');
      const XLSX =
        xlsxModule?.default && xlsxModule.default.utils
          ? xlsxModule.default
          : xlsxModule;
      const rows = [
        ['Kunde', customerBillingSummary.customerLabel],
        ['Anzahl Aufträge', customerBillingSummary.orderCount],
        ['Gesamtbetrag Aufträge', customerBillingSummary.orderTotal],
        ['Gesamtbetrag Tank/Auslagen', customerBillingSummary.fuelTotal],
        ['Gesamtsumme', customerBillingSummary.grandTotal],
        [],
        ['Auftragsnummer', 'Art', 'Datum', 'Route', 'Fahrzeug', 'Kennzeichen', 'Auftragspreis', 'Auslagen (Tank)', 'Gesamt'],
        ...customerBillingRows.map((row) => [
          row.orderNumber,
          row.billingLabel || '-',
          row.dateLabel,
          row.route,
          row.vehicle,
          row.plate,
          row.orderPrice,
          row.fuelExpenses,
          row.total,
        ]),
        [],
        ['SUMME', '', '', '', '', '', customerBillingSummary.orderTotal, customerBillingSummary.fuelTotal, customerBillingSummary.grandTotal],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 42 },
        { wch: 20 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Kundenabrechnung');
      const stamp = format(new Date(), 'yyyyMMdd_HHmm');
      const customerSafe =
        sanitizeFileNamePart(customerBillingSummary.customerLabel || 'Kunde', 32) || 'Kunde';
      XLSX.writeFile(workbook, `Kundenabrechnung_${customerSafe}_${stamp}.xlsx`);
    } catch (error) {
      setBulkError(error?.message || 'Excel-Export fehlgeschlagen.');
    } finally {
      setBulkBillingExporting(false);
    }
  };

  const exportCustomerBillingPdf = async () => {
    if (!customerBillingRows.length) return;
    setBulkBillingExporting(true);
    setBulkError('');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(15);
      doc.text('Kundenabrechnung', 40, 36);
      doc.setFontSize(10);
      doc.text(`Kunde: ${customerBillingSummary.customerLabel}`, 40, 56);
      doc.text(`Anzahl Aufträge: ${customerBillingSummary.orderCount}`, 40, 72);
      doc.text(`Gesamtbetrag Aufträge: ${formatCurrencyValue(customerBillingSummary.orderTotal)}`, 320, 56);
      doc.text(`Gesamtbetrag Tank/Auslagen: ${formatCurrencyValue(customerBillingSummary.fuelTotal)}`, 320, 72);
      doc.text(`Gesamtsumme: ${formatCurrencyValue(customerBillingSummary.grandTotal)}`, 610, 72);

      autoTable(doc, {
        startY: 88,
        head: [['Auftragsnr.', 'Art', 'Datum', 'Route', 'Fahrzeug', 'Kennzeichen', 'Auftragspreis', 'Auslagen (Tank)', 'Gesamt']],
        body: customerBillingRows.map((row) => [
          row.orderNumber,
          row.billingLabel || '-',
          row.dateLabel,
          row.route,
          row.vehicle,
          row.plate,
          formatCurrencyValue(row.orderPrice),
          formatCurrencyValue(row.fuelExpenses),
          formatCurrencyValue(row.total),
        ]),
        foot: [[
          'SUMME',
          '',
          '',
          '',
          '',
          '',
          formatCurrencyValue(customerBillingSummary.orderTotal),
          formatCurrencyValue(customerBillingSummary.fuelTotal),
          formatCurrencyValue(customerBillingSummary.grandTotal),
        ]],
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 58, 95] },
        footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 68 },
          1: { cellWidth: 88 },
          2: { cellWidth: 56 },
          3: { cellWidth: 208 },
          4: { cellWidth: 82 },
          5: { cellWidth: 62 },
          6: { cellWidth: 76, halign: 'right' },
          7: { cellWidth: 84, halign: 'right' },
          8: { cellWidth: 76, halign: 'right' },
        },
      });

      const stamp = format(new Date(), 'yyyyMMdd_HHmm');
      const customerSafe =
        sanitizeFileNamePart(customerBillingSummary.customerLabel || 'Kunde', 32) || 'Kunde';
      doc.save(`Kundenabrechnung_${customerSafe}_${stamp}.pdf`);
    } catch (error) {
      setBulkError(error?.message || 'PDF-Export fehlgeschlagen.');
    } finally {
      setBulkBillingExporting(false);
    }
  };

  const openInvoicePageForCustomer = (customerKey) => {
    if (!customerKey) return;
    const customerRows = customerBillingRows
      .filter((row) => row.customerKey === customerKey)
      .map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        billingLabel: row.billingLabel || '',
        dateLabel: row.dateLabel,
        route: row.route,
        pickupAddress: row.pickupAddress || '',
        dropoffAddress: row.dropoffAddress || '',
        vehicle: row.vehicle,
        plate: row.plate,
        orderPrice: Number(row.orderPrice || 0),
        fuelExpenses: Number(row.fuelExpenses || 0),
      }));
    if (!customerRows.length) {
      setBulkError('Für den ausgewählten Kunden wurden keine Aufträge gefunden.');
      return;
    }

    const customerLabel =
      customerBillingCustomers.find((customer) => customer.key === customerKey)?.label || 'Kunde';
    const customerRecord =
      customerKey !== '__none__' ? customerLookupById.get(customerKey) : null;
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const draft = {
      id: draftId,
      customerKey,
      customerLabel,
      createdAt: new Date().toISOString(),
      status: 'draft',
      source: 'orders-bulk',
      createdBy: currentUser?.id || '',
      companyId: currentUser?.company_id || '',
      customer: customerRecord
        ? {
            id: customerRecord.id,
            customer_number: customerRecord.customer_number || '',
            type: customerRecord.type || 'business',
            company_name: customerRecord.company_name || '',
            first_name: customerRecord.first_name || '',
            last_name: customerRecord.last_name || '',
            email: customerRecord.email || '',
            phone: customerRecord.phone || '',
            address: customerRecord.address || '',
            postal_code: customerRecord.postal_code || '',
            city: customerRecord.city || '',
            country: customerRecord.country || '',
            tax_id: customerRecord.tax_id || '',
          }
        : null,
      rows: customerRows,
    };
    upsertInvoiceDraft(draft);
    const targetUrl = `${createPageUrl('CustomerInvoice')}?id=${encodeURIComponent(draftId)}`;
    const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = targetUrl;
    }
    setInvoiceCustomerPickerOpen(false);
    setBulkCustomerBillingOpen(false);
  };

  const handleOpenInvoiceFlow = () => {
    if (!customerBillingRows.length) return;
    setBulkError('');
    if (customerBillingCustomers.length <= 1) {
      openInvoicePageForCustomer(customerBillingCustomers[0]?.key || '__none__');
      return;
    }
    const defaultCustomer = customerBillingCustomers[0]?.key || '';
    setInvoicePickerCustomerKey(defaultCustomer);
    setInvoiceCustomerPickerOpen(true);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      const now = new Date().toISOString();
      for (const id of selectedIds) {
        await appClient.entities.Order.update(id, { deleted_at: now });
      }
      setBulkMessage('Aufträge wurden in den Papierkorb verschoben.');
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-trashed'] });
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
          review_completed,
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

  const handleBulkDownloadExpenses = async () => {
    if (!selectedOrders.length) return;
    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      const fileNameCounts = {};
      let totalWithFile = 0;
      let downloadedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const order of selectedOrders) {
        const orderChecklists = checklists.filter((checklist) => checklist?.order_id === order.id);
        for (const checklist of orderChecklists) {
          const expenses = Array.isArray(checklist?.expenses) ? checklist.expenses : [];
          for (const expense of expenses) {
            if (!expense?.file_url) {
              skippedCount += 1;
              continue;
            }
            totalWithFile += 1;
            const typeLabel = sanitizeFileNamePart(
              EXPENSE_TYPE_LABELS[expense.type] || expense.type || 'Auslage',
              32
            );
            const plateLabel = sanitizeFileNamePart(
              order.license_plate || order.order_number || 'Auftrag',
              24
            );
            const descriptionLabel = sanitizeFileNamePart(
              expense.note || expense.file_name || '',
              40
            );
            const amountLabel = formatExpenseAmountLabel(expense.amount);
            const dateLabel = formatExpenseDateLabel(checklist, order);
            const baseParts = [typeLabel, plateLabel];
            if (descriptionLabel) baseParts.push(descriptionLabel);
            if (amountLabel) baseParts.push(amountLabel);
            if (dateLabel) baseParts.push(dateLabel);
            const baseName =
              sanitizeFileNamePart(baseParts.filter(Boolean).join(' '), 180) || 'Auslage';
            fileNameCounts[baseName] = (fileNameCounts[baseName] || 0) + 1;
            const duplicateIndex = fileNameCounts[baseName];
            const uniqueBaseName =
              duplicateIndex > 1 ? `${baseName} (${duplicateIndex})` : baseName;

            try {
              const response = await fetch(expense.file_url);
              if (!response.ok) {
                throw new Error(`Download fehlgeschlagen (${response.status})`);
              }
              const blob = await response.blob();
              const extension = getExpenseExtension(expense, blob.type);
              const fileName = extension
                ? `${uniqueBaseName}.${extension}`
                : uniqueBaseName;
              const blobUrl = window.URL.createObjectURL(blob);
              triggerDownload(blobUrl, fileName);
              window.URL.revokeObjectURL(blobUrl);
              downloadedCount += 1;
            } catch {
              try {
                const fallbackExtension = getExpenseExtension(expense);
                const fallbackName = fallbackExtension
                  ? `${uniqueBaseName}.${fallbackExtension}`
                  : uniqueBaseName;
                triggerDownload(expense.file_url, fallbackName);
                downloadedCount += 1;
              } catch {
                failedCount += 1;
              }
            }
          }
        }
      }

      if (totalWithFile === 0) {
        setBulkError('In der Auswahl wurden keine Auslagen-Dateien gefunden.');
        return;
      }

      if (downloadedCount === 0) {
        setBulkError('Auslagen konnten nicht heruntergeladen werden.');
        return;
      }

      const summaryParts = [`Auslagen heruntergeladen: ${downloadedCount}`];
      if (skippedCount > 0) {
        summaryParts.push(`ohne Datei übersprungen: ${skippedCount}`);
      }
      if (failedCount > 0) {
        summaryParts.push(`Fehler: ${failedCount}`);
      }
      setBulkMessage(summaryParts.join(' · '));
    } catch (err) {
      setBulkError(err?.message || 'Auslagen-Download fehlgeschlagen.');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkAssignCustomer = async () => {
    if (!selectedOrders.length) return;
    if (!bulkCustomerId || bulkCustomerId === 'none') {
      setBulkError('Bitte zuerst einen Kunden auswählen.');
      return;
    }
    const customer = customers.find((item) => item.id === bulkCustomerId);
    if (!customer) {
      setBulkError('Kunde konnte nicht gefunden werden.');
      return;
    }

    const customerName = getCustomerDisplayName(customer) || customer.email || 'Kunde';

    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      let updatedPriceCount = 0;
      const missingPriceOrders = [];
      for (const order of selectedOrders) {
        let computedDistance = Number.parseFloat(order.distance_km);
        if (!Number.isFinite(computedDistance)) {
          try {
            const distanceKm = await getMapboxDistanceKm({
              pickupAddress: order.pickup_address,
              pickupCity: order.pickup_city,
              pickupPostalCode: order.pickup_postal_code,
              dropoffAddress: order.dropoff_address,
              dropoffCity: order.dropoff_city,
              dropoffPostalCode: order.dropoff_postal_code,
            });
            if (distanceKm !== null && distanceKm !== undefined) {
              computedDistance = distanceKm;
            }
          } catch {
            // Distance calculation failed – proceed without distance
          }
        }

        const updates = {
          customer_id: customer.id,
          customer_name: customerName,
          customer_email: customer.email || '',
          customer_phone: customer.phone || '',
        };
        if (Number.isFinite(computedDistance)) {
          updates.distance_km = computedDistance;
        }
        const priceFromList = Number.isFinite(computedDistance)
          ? getPriceForDistance(customer.price_list || [], computedDistance)
          : null;
        if (priceFromList !== null && priceFromList !== undefined) {
          updates.driver_price = priceFromList;
          updatedPriceCount += 1;
        } else {
          missingPriceOrders.push(order.order_number || order.id);
        }
        await appClient.entities.Order.update(order.id, updates);
      }

      const summary = `Kunde wurde zugeordnet. Preise aus Preisliste aktualisiert: ${updatedPriceCount}/${selectedOrders.length}.`;
      if (missingPriceOrders.length) {
        const details = ` Nicht aktualisiert: ${missingPriceOrders.join(', ')}.`;
        setBulkMessage(`${summary}${details}`);
      } else {
        setBulkMessage(summary);
      }
      setBulkAssignCustomerOpen(false);
      setSelectedIds([]);
      setBulkCustomerId('none');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      setBulkError(err?.message || 'Kundenzuordnung fehlgeschlagen.');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkStornoLeerfahrt = async () => {
    if (!selectedOrders.length) return;
    const targets = selectedOrders.filter((order) => order.status !== 'completed');
    if (!targets.length) {
      setBulkError('Keine geeigneten Aufträge gefunden.');
      return;
    }

    const percentValue = Number.parseFloat(String(leerfahrtPercent || '').replace(',', '.'));
    const flatValue = Number.parseFloat(String(leerfahrtFlatAmount || '').replace(',', '.'));
    if (stornoLeerfahrtType === 'leerfahrt' && leerfahrtCalcMode === 'percent') {
      if (!Number.isFinite(percentValue) || percentValue < 0) {
        setBulkError('Bitte einen gültigen Prozentwert für Leerfahrt eingeben.');
        return;
      }
    }
    if (stornoLeerfahrtType === 'leerfahrt' && leerfahrtCalcMode === 'flat') {
      if (!Number.isFinite(flatValue) || flatValue < 0) {
        setBulkError('Bitte einen gültigen Pauschalbetrag für Leerfahrt eingeben.');
        return;
      }
    }

    setBulkWorking(true);
    setBulkError('');
    setBulkMessage('');
    try {
      for (const order of targets) {
        const originalPrice = Number.parseFloat(order.driver_price);
        const originalPriceSafe = Number.isFinite(originalPrice) ? originalPrice : 0;
        let adjustedPrice = 0;
        let mode = 'none';
        let percent = null;
        let flatAmount = null;

        if (stornoLeerfahrtType === 'leerfahrt') {
          if (leerfahrtCalcMode === 'flat') {
            mode = 'flat';
            flatAmount = roundCurrency(flatValue);
            adjustedPrice = flatAmount;
          } else {
            mode = 'percent';
            percent = roundCurrency(percentValue);
            adjustedPrice = roundCurrency((originalPriceSafe * percent) / 100);
          }
        }

        const billingOverride = {
          type: stornoLeerfahrtType,
          mode,
          percent,
          flatAmount,
          originalPrice: roundCurrency(originalPriceSafe),
          adjustedPrice: roundCurrency(adjustedPrice),
          updatedAt: new Date().toISOString(),
        };

        await appClient.entities.Order.update(order.id, {
          status: 'cancelled',
          driver_price: adjustedPrice,
          status_override_reason: encodeBillingOverride(billingOverride),
        });
      }
      setBulkMessage(
        stornoLeerfahrtType === 'storno'
          ? 'Aufträge wurden als Storno markiert (nicht berechnet).'
          : 'Aufträge wurden als Leerfahrt markiert und berechnet.'
      );
      setSelectedIds([]);
      setBulkStornoLeerfahrtOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      setBulkError(err?.message || 'Storno/Leerfahrt konnte nicht gespeichert werden.');
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

  const handleReviewComplete = async (orderId) => {
    if (!orderId) return;
    setReviewSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      await appClient.entities.Order.update(orderId, { review_completed: true });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      toast({ title: 'Fehler', description: err?.message || 'Auftrag konnte nicht als geprüft markiert werden.', variant: 'destructive' });
    } finally {
      setReviewSaving((prev) => ({ ...prev, [orderId]: false }));
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
              <AlertDialogTitle>Auftrag in den Papierkorb verschieben?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Auftrag {selectedOrder.order_number} wird in den Papierkorb verschoben und nach 30 Tagen automatisch gelöscht. Du kannst ihn jederzeit wiederherstellen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedOrder.id)}
              >
                In Papierkorb
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6 orders-list-zoom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aufträge</h1>
          <p className="text-gray-500">{orders.length} Aufträge insgesamt</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={() => window.location.href = createPageUrl('AIImport')}
          >
            <Truck className="w-4 h-4 mr-2" />
            AI Import
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = createPageUrl('EmailAIImport')}
          >
            <Mail className="w-4 h-4 mr-2" />
            Email AI Import
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = createPageUrl('DriverPriceRequests')}
          >
            Fahrer Preis Anfragen
            {pendingPriceSegments.length ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {pendingPriceSegments.length}
              </span>
            ) : null}
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
        {trashedOrders.length > 0 && (
          <Button
            variant={listMode === 'trash' ? 'default' : 'outline'}
            className={listMode === 'trash' ? 'bg-red-600 hover:bg-red-700' : 'text-red-600 border-red-200 hover:bg-red-50'}
            onClick={() => handleListModeChange('trash')}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Papierkorb ({trashedOrders.length})
          </Button>
        )}
      </div>

      {listMode === 'trash' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Papierkorb
              <span className="text-sm font-normal text-gray-500">
                — Aufträge werden nach 30 Tagen automatisch gelöscht
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trashedOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Der Papierkorb ist leer.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Auftragsnr.</TableHead>
                      <TableHead>Kennzeichen</TableHead>
                      <TableHead>Von → Nach</TableHead>
                      <TableHead>Gelöscht am</TableHead>
                      <TableHead>Verbleibend</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashedOrders.map((order) => {
                      const deletedAt = new Date(order.deleted_at);
                      const expiresAt = addDays(deletedAt, 30);
                      const daysLeft = Math.max(0, differenceInCalendarDays(expiresAt, new Date()));
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number || '-'}</TableCell>
                          <TableCell>{order.license_plate || '-'}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {order.pickup_city || '-'} → {order.dropoff_city || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(deletedAt, 'dd.MM.yyyy', { locale: de })}
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${daysLeft <= 7 ? 'text-red-600' : daysLeft <= 14 ? 'text-amber-600' : 'text-gray-600'}`}>
                              {daysLeft} {daysLeft === 1 ? 'Tag' : 'Tage'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => restoreOrderMutation.mutate(order.id)}
                                disabled={restoreOrderMutation.isPending}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                Wiederherstellen
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => {
                                  if (window.confirm(`Auftrag ${order.order_number || ''} endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
                                    permanentDeleteMutation.mutate(order.id);
                                  }
                                }}
                                disabled={permanentDeleteMutation.isPending}
                              >
                                Endgültig löschen
                              </Button>
                            </div>
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
      )}

      {listMode !== 'trash' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>}

      {listMode !== 'trash' && <>
      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Suche nach Auftragsnummer, Kunde, Kennzeichen, Ort, PLZ, Straße..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Suche leeren"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Auslagen</p>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <Button
                type="button"
                size="sm"
                variant={expensesFilter === 'all' ? 'default' : 'ghost'}
                className={expensesFilter === 'all' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                onClick={() => setExpensesFilter('all')}
              >
                Alle
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expensesFilter === 'with' ? 'default' : 'ghost'}
                className={expensesFilter === 'with' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                onClick={() => setExpensesFilter('with')}
              >
                Mit Auslagen
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expensesFilter === 'without' ? 'default' : 'ghost'}
                className={expensesFilter === 'without' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                onClick={() => setExpensesFilter('without')}
              >
                Keine Auslagen
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Fälligkeit</label>
              <Select value={dueSort} onValueChange={setDueSort}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Fälligkeit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Fälligkeit: neu → alt</SelectItem>
                  <SelectItem value="asc">Fälligkeit: alt → neu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Datum von</label>
              <Input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Datum bis</label>
              <Input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                className="w-full"
              />
              {(dateFromFilter || dateToFilter) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setDateFromFilter('');
                    setDateToFilter('');
                  }}
                >
                  Datum löschen
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {listMode === 'active' ? 'Alle Status' : 'Alle abgeschlossenen'}
                  </SelectItem>
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
                    <>
                      <SelectItem value="completed">Erfolgreich beendet</SelectItem>
                      <SelectItem value="cancelled">Storniert</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Fahrer</label>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-full">
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

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Kunden</label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Kunden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kunden</SelectItem>
                  <SelectItem value="none">Ohne Kunde</SelectItem>
                  {customers.map((customer) => {
                    const name =
                      customer.type === 'business' && customer.company_name
                        ? customer.company_name
                        : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
                    const label = name || customer.email || 'Kunde';
                    return (
                      <SelectItem key={customer.id} value={customer.id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
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
                variant="outline"
                onClick={handleBulkDownloadExpenses}
                disabled={bulkWorking}
              >
                <Download className="h-4 w-4 mr-2" />
                Auslagen herunterladen
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkError('');
                  setBulkMessage('');
                  setBulkAssignCustomerOpen(true);
                }}
                disabled={bulkWorking}
              >
                An Kunden zuordnen
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkError('');
                  setBulkMessage('');
                  setBulkCustomerBillingOpen(true);
                }}
                disabled={bulkWorking}
              >
                Mit Kunden abrechnen
              </Button>
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => {
                  setBulkError('');
                  setBulkMessage('');
                  setBulkStornoLeerfahrtOpen(true);
                }}
                disabled={bulkWorking}
              >
                Storno / Leerfahrt
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

      {/* Selection toggle + Table */}
      <div className="flex items-center justify-between mb-2">
        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (selectionMode) {
              setSelectedIds([]);
            }
            setSelectionMode(!selectionMode);
          }}
          className={selectionMode ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
        >
          <CheckSquare className="w-4 h-4 mr-1.5" />
          {selectionMode ? 'Fertig' : 'Auswählen'}
        </Button>
        {selectionMode && selectedIds.length > 0 && (
          <span className="text-sm text-slate-500">{selectedIds.length} ausgewählt</span>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={10} cols={6} />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Keine Aufträge gefunden</p>
              {hasActiveFilters ? (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setDriverFilter('all');
                    setCustomerFilter('all');
                    setExpensesFilter('all');
                    setDueFilter('all');
                    setDateFromFilter('');
                    setDateToFilter('');
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
            <>
              <div className="block md:hidden">
                <div className="divide-y divide-slate-200">
                  {paginatedOrders.map((order) => {
                    const mainStatus = getMainOrderStatus(order.status);
                    const deliverySubstatuses = getLatestDeliverySubstatus(order);
                    const billingOverride = parseBillingOverride(order);
                    const billingLabel = formatBillingOverrideLabel(billingOverride);
                    const billingType = billingOverride?.type || '';
                    const dueStatus = getDueStatus(order);
                    const isCompleted = order.status === 'completed';
                    const isCancelled = order.status === 'cancelled';
                    const reviewCompleted = Boolean(order.review_completed);
                    const rowTone = isCancelled && billingType === 'leerfahrt'
                      ? 'bg-amber-50 border border-amber-200 text-amber-900'
                      : isCancelled
                      ? 'bg-red-50 border border-red-200 border-dashed text-red-700 line-through decoration-red-400'
                      : isCompleted
                      ? reviewCompleted
                        ? 'bg-emerald-50'
                        : 'bg-blue-50'
                      : dueStatus.state === 'overdue'
                      ? 'bg-red-50'
                      : dueStatus.state === 'today'
                      ? 'bg-yellow-50'
                      : 'bg-green-50';
                    const dueDetail = isCompleted || isCancelled ? null : dueStatus.detail;
                    return (
                      <div
                        key={order.id}
                        className={`p-4 ${rowTone} cursor-pointer ${selectionMode && selectedIds.includes(order.id) ? 'ring-2 ring-[#1e3a5f] ring-inset' : ''}`}
                        onClick={() => {
                          if (selectionMode) {
                            toggleSelect(order.id, !selectedIds.includes(order.id));
                          } else {
                            openOrderDetails(order);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm uppercase tracking-wide text-slate-400">Auftrag</p>
                            <p className="text-lg font-semibold text-[#1e3a5f]">
                              {order.order_number}
                            </p>
                            {billingLabel ? (
                              <p className="mt-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                {billingLabel}
                              </p>
                            ) : null}
                            <p className="text-sm text-slate-500">{order.license_plate}</p>
                          </div>
                          {selectionMode && (
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 ${selectedIds.includes(order.id) ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white' : 'border-slate-300 bg-white'}`}>
                              {selectedIds.includes(order.id) && <CheckSquare className="w-4 h-4" />}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                          <div>
                            <p className="uppercase text-xs text-slate-400">Fahrzeug</p>
                            <p className="font-semibold text-slate-700">
                              {order.vehicle_brand} {order.vehicle_model}
                            </p>
                            <p className="text-xs text-slate-500">{order.vehicle_color}</p>
                          </div>
                          <div>
                            <p className="uppercase text-xs text-slate-400">Route</p>
                            <p className="font-semibold text-slate-700">
                              {order.pickup_city || 'N/A'} → {order.dropoff_city || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="uppercase text-xs text-slate-400">Fahrer</p>
                            <p className="font-semibold text-slate-700">
                              {order.assigned_driver_name || 'Nicht zugewiesen'}
                            </p>
                          </div>
                          <div>
                            <p className="uppercase text-xs text-slate-400">Auslagen</p>
                            {expensesByOrder[order.id] ? (
                              <Check className="h-4 w-4 text-emerald-600" aria-label="Auslagen vorhanden" />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                          <div>
                            <p className="uppercase text-xs text-slate-400">Fällig bis</p>
                            <p className="font-semibold text-slate-700">{dueStatus.label}</p>
                            {dueDetail && (
                              <p className={`text-xs ${
                                dueStatus.state === 'overdue'
                                  ? 'text-red-700'
                                  : dueStatus.state === 'today'
                                  ? 'text-yellow-700'
                                  : 'text-green-700'
                              }`}>
                                {dueDetail}
                              </p>
                            )}
                          </div>
                          {listMode === 'completed' ? (
                            <div className="flex flex-col gap-1">
                              <p className="uppercase text-xs text-slate-400">Prüfung</p>
                              <div onClick={(event) => event.stopPropagation()}>
                                {reviewCompleted ? (
                                  <div className="inline-flex items-center gap-1 text-emerald-700">
                                    <Check className="h-4 w-4" />
                                    <span className="text-xs">Geprüft</span>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="px-2"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleReviewComplete(order.id);
                                    }}
                                    disabled={reviewSaving[order.id]}
                                  >
                                    {reviewSaving[order.id] ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <p className="uppercase text-xs text-slate-400">Status</p>
                              <StatusBadge status={mainStatus} />
                              {deliverySubstatuses.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {deliverySubstatuses.map((subStatus) => (
                                    <StatusBadge
                                      key={`${order.id}-${subStatus}-mobile`}
                                      status={subStatus}
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {listMode === 'completed' && (
                          <div className="mt-3">
                            <StatusBadge status={mainStatus} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50 cursor-default select-none">
                      {selectionMode && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allSelected || (someSelected ? "indeterminate" : false)}
                            onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </TableHead>
                      )}
                      <TableHead>Auftrag</TableHead>
                      <TableHead>Fahrzeug</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Fahrer</TableHead>
                      <TableHead>Auslagen</TableHead>
                      <TableHead>Fällig bis</TableHead>
                      <TableHead>Status</TableHead>
                      {listMode === 'completed' && <TableHead>Prüfung</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => {
                      const mainStatus = getMainOrderStatus(order.status);
                      const deliverySubstatuses = getLatestDeliverySubstatus(order);
                      const billingOverride = parseBillingOverride(order);
                      const billingLabel = formatBillingOverrideLabel(billingOverride);
                      const billingType = billingOverride?.type || '';
                      const dueStatus = getDueStatus(order);
                      const isCompleted = order.status === 'completed';
                      const isCancelled = order.status === 'cancelled';
                      const reviewCompleted = Boolean(order.review_completed);
                      const rowTone = isCancelled && billingType === 'leerfahrt'
                        ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200'
                        : isCancelled
                        ? 'bg-red-50 hover:bg-red-100 border border-red-200 border-dashed text-red-700 line-through decoration-red-400'
                        : isCompleted
                        ? reviewCompleted
                          ? 'bg-emerald-200 hover:bg-emerald-300'
                          : 'bg-blue-50 hover:bg-blue-100'
                        : dueStatus.state === 'overdue'
                        ? 'bg-red-50 hover:bg-red-100'
                        : dueStatus.state === 'today'
                        ? 'bg-yellow-50 hover:bg-yellow-100'
                        : 'bg-green-50 hover:bg-green-100';
                      const dueDetail = isCompleted || isCancelled ? null : dueStatus.detail;
                      return (
                        <TableRow
                          key={order.id}
                          className={`cursor-pointer ${rowTone} ${selectionMode && selectedIds.includes(order.id) ? 'ring-2 ring-[#1e3a5f] ring-inset' : ''}`}
                          onClick={() => {
                            if (selectionMode) {
                              toggleSelect(order.id, !selectedIds.includes(order.id));
                            } else {
                              openOrderDetails(order);
                            }
                          }}
                        >
                          {selectionMode && (
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.includes(order.id)}
                                onCheckedChange={(checked) => toggleSelect(order.id, Boolean(checked))}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <div>
                              <p className="font-semibold text-[#1e3a5f]">{order.order_number}</p>
                              {billingLabel ? (
                                <p className="mt-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                  {billingLabel}
                                </p>
                              ) : null}
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
                            <div className="space-y-1">
                              <StatusBadge status={mainStatus} />
                              {deliverySubstatuses.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {deliverySubstatuses.map((subStatus) => (
                                    <StatusBadge
                                      key={`${order.id}-${subStatus}-table`}
                                      status={subStatus}
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          {listMode === 'completed' && (
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              {reviewCompleted ? (
                                <div className="flex items-center justify-center text-emerald-700">
                                  <Check className="h-4 w-4" />
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="px-2"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleReviewComplete(order.id);
                                  }}
                                  disabled={reviewSaving[order.id]}
                                >
                                  {reviewSaving[order.id] ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {sortedOrders.length > PAGE_SIZE && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">
                    Zeige {Math.min((currentPage - 1) * PAGE_SIZE + 1, sortedOrders.length)}-
                    {Math.min(currentPage * PAGE_SIZE, sortedOrders.length)} von {sortedOrders.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1}
                    >
                      Zurück
                    </Button>
                    {pageItems.map((item) =>
                      item.type === 'page' ? (
                        <Button
                          key={item.key}
                          size="sm"
                          variant={item.page === currentPage ? 'default' : 'outline'}
                          className={item.page === currentPage ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                          onClick={() => setCurrentPage(item.page)}
                        >
                          {item.page}
                        </Button>
                      ) : (
                        <span key={item.key} className="px-2 text-xs text-slate-400">
                          …
                        </span>
                      )
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Nächste Seite
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={bulkStornoLeerfahrtOpen}
        onOpenChange={(open) => {
          if (bulkWorking) return;
          setBulkStornoLeerfahrtOpen(open);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Storno / Leerfahrt</DialogTitle>
            <DialogDescription>
              Lege fest, ob die ausgewählten Aufträge komplett storniert werden oder als Leerfahrt berechnet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Aktion</label>
              <Select value={stornoLeerfahrtType} onValueChange={setStornoLeerfahrtType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="storno">Komplett stornieren (nicht berechnen)</SelectItem>
                  <SelectItem value="leerfahrt">Als Leerfahrt berechnen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {stornoLeerfahrtType === 'leerfahrt' ? (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Berechnungsart</label>
                  <Select value={leerfahrtCalcMode} onValueChange={setLeerfahrtCalcMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Prozent vom Auftragspreis</SelectItem>
                      <SelectItem value="flat">Pauschalbetrag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {leerfahrtCalcMode === 'percent' ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Prozent</label>
                    <Input
                      value={leerfahrtPercent}
                      onChange={(event) => setLeerfahrtPercent(event.target.value)}
                      inputMode="decimal"
                      placeholder="z. B. 40"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Pauschalbetrag (EUR)</label>
                    <Input
                      value={leerfahrtFlatAmount}
                      onChange={(event) => setLeerfahrtFlatAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="z. B. 120,00"
                    />
                  </div>
                )}
              </>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Ausgewählte Aufträge</p>
                <p className="font-semibold text-slate-900">{selectedOrders.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Aktuelle Summe Auftragspreise</p>
                <p className="font-semibold text-slate-900">{formatCurrencyValue(selectedOrdersBaseTotal)}</p>
              </div>
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 sm:col-span-2">
                <p className="text-xs text-emerald-700">Neue Summe nach Speicherung</p>
                <p className="font-semibold text-emerald-900">{formatCurrencyValue(stornoLeerfahrtPreviewTotal)}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStornoLeerfahrtOpen(false)} disabled={bulkWorking}>
              Abbrechen
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={handleBulkStornoLeerfahrt}
              disabled={bulkWorking || selectedOrders.length === 0}
            >
              {bulkWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufträge in den Papierkorb verschieben?</AlertDialogTitle>
            <AlertDialogDescription>
              Die ausgewählten Aufträge werden in den Papierkorb verschoben und nach 30 Tagen automatisch gelöscht. Du kannst sie jederzeit wiederherstellen.
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

      <AlertDialog open={bulkAssignCustomerOpen} onOpenChange={setBulkAssignCustomerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufträge an Kunden zuordnen</AlertDialogTitle>
            <AlertDialogDescription>
              Wähle einen Kunden aus. Die ausgewählten Aufträge werden diesem Kunden zugeordnet und
              der Auftragspreis wird – falls möglich – aus der Kunden-Preisliste aktualisiert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Select value={bulkCustomerId} onValueChange={setBulkCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Kunde auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Bitte Kunde wählen</SelectItem>
                {customers.map((customer) => {
                  const name = getCustomerDisplayName(customer);
                  const label = customer.customer_number
                    ? `${name || customer.email || 'Kunde'} (${customer.customer_number})`
                    : name || customer.email || 'Kunde';
                  return (
                    <SelectItem key={customer.id} value={customer.id}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Ausgewählte Aufträge: {selectedOrders.length}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkWorking}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={handleBulkAssignCustomer}
              disabled={bulkWorking || !bulkCustomerId || bulkCustomerId === 'none'}
            >
              {bulkWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zuordnen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkCustomerBillingOpen} onOpenChange={setBulkCustomerBillingOpen}>
        <DialogContent className="max-w-[96vw] lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Kundenabrechnung</DialogTitle>
            <DialogDescription>
              Übersicht der ausgewählten Aufträge inkl. Auftragspreis und Tank-Auslagen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Kunde</p>
              <p className="font-semibold text-slate-900">{customerBillingSummary.customerLabel}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Aufträge</p>
              <p className="font-semibold text-slate-900">{customerBillingSummary.orderCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Gesamt Aufträge</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(customerBillingSummary.orderTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Gesamt Tank</p>
              <p className="font-semibold text-slate-900">{formatCurrencyValue(customerBillingSummary.fuelTotal)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
              <p className="text-xs text-emerald-700">Gesamtsumme</p>
              <p className="font-semibold text-emerald-900">{formatCurrencyValue(customerBillingSummary.grandTotal)}</p>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Auftragsnummer</th>
                  <th className="px-3 py-2">Art</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Fahrzeug</th>
                  <th className="px-3 py-2">Kennzeichen</th>
                  <th className="px-3 py-2 text-right">Auftragspreis</th>
                  <th className="px-3 py-2 text-right">Auslagen (Tank)</th>
                  <th className="px-3 py-2 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {customerBillingRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{row.orderNumber}</td>
                    <td className="px-3 py-2">{row.billingLabel || '-'}</td>
                    <td className="px-3 py-2">{row.dateLabel}</td>
                    <td className="px-3 py-2">{row.route}</td>
                    <td className="px-3 py-2">{row.vehicle}</td>
                    <td className="px-3 py-2">{row.plate}</td>
                    <td className="px-3 py-2 text-right">{formatCurrencyValue(row.orderPrice)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrencyValue(row.fuelExpenses)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrencyValue(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-300 font-semibold text-slate-900">
                  <td className="px-3 py-2">SUMME</td>
                  <td className="px-3 py-2" colSpan={5}></td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(customerBillingSummary.orderTotal)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(customerBillingSummary.fuelTotal)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrencyValue(customerBillingSummary.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={exportCustomerBillingExcel}
              disabled={bulkBillingExporting || customerBillingRows.length === 0}
            >
              {bulkBillingExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Als Excel herunterladen
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={exportCustomerBillingPdf}
              disabled={bulkBillingExporting || customerBillingRows.length === 0}
            >
              {bulkBillingExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Als PDF herunterladen
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleOpenInvoiceFlow}
              disabled={bulkBillingExporting || customerBillingRows.length === 0}
            >
              In Rechnung stellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceCustomerPickerOpen} onOpenChange={setInvoiceCustomerPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kunden für Rechnung wählen</DialogTitle>
            <DialogDescription>
              In der Auswahl sind mehrere Kunden enthalten. Wähle bitte den Kunden, den du jetzt abrechnen möchtest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={invoicePickerCustomerKey} onValueChange={setInvoicePickerCustomerKey}>
              <SelectTrigger>
                <SelectValue placeholder="Kunde auswählen" />
              </SelectTrigger>
              <SelectContent>
                {customerBillingCustomers.map((customer) => (
                  <SelectItem key={customer.key} value={customer.key}>
                    {customer.label} ({customer.orderCount} Auftrag{customer.orderCount !== 1 ? 'e' : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceCustomerPickerOpen(false)}>
              Abbrechen
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              onClick={() => openInvoicePageForCustomer(invoicePickerCustomerKey)}
              disabled={!invoicePickerCustomerKey}
            >
              Rechnung öffnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>}
    </div>
  );
}
