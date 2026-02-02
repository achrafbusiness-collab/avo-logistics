import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Truck, 
  Users, 
  ArrowRight,
  AlertCircle,
  Calendar,
  Route,
  Search,
  Settings,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from '@/components/ui/StatusBadge';
import OrdersMap from '@/components/dashboard/OrdersMap';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { de } from 'date-fns/locale';

const toDateKey = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'yyyy-MM-dd');
};

const DELIVERY_STATUSES = new Set(['in_transit', 'shuttle']);
const OPEN_STATUSES = ['new', 'assigned', 'pickup_started', 'delivery_started', 'zwischenabgabe'];
const COMPLETED_STATUSES = new Set(['completed', 'review', 'ready_for_billing', 'approved']);

const parseAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(todayKey);
  const [dateTo, setDateTo] = useState(todayKey);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [mapMode, setMapMode] = useState('open');
  const [onlyDue, setOnlyDue] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [profitTargetSaved, setProfitTargetSaved] = useState('');

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 100),
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list('-created_date', 100),
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 10),
  });

  const { data: orderSegments = [] } = useQuery({
    queryKey: ['dashboard-order-segments'],
    queryFn: () => appClient.entities.OrderSegment.list('-created_date', 3000),
  });

  const { data: financeChecklists = [] } = useQuery({
    queryKey: ['dashboard-finance-checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 3000),
  });

  const rangeOrders = useMemo(() => {
    if (!dateFrom && !dateTo) return orders;
    const start = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
    const end = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;
    return orders.filter((order) => {
      const orderDate = toDateKey(order.pickup_date) || toDateKey(order.dropoff_date) || toDateKey(order.created_date);
      if (!orderDate) return false;
      if (start && orderDate < start) return false;
      if (end && orderDate > end) return false;
      if (onlyDue) {
        const dueDate = toDateKey(order.dropoff_date) || toDateKey(order.pickup_date);
        if (!dueDate) return false;
        if (dueDate > todayKey) return false;
      }
      return true;
    });
  }, [orders, dateFrom, dateTo, onlyDue, todayKey]);

  const stats = {
    pendingOrders: rangeOrders.filter(o => o.status === 'new').length,
    activeDrivers: drivers.filter(d => d.status === 'active').length,
    completedOrders: rangeOrders.filter(o => COMPLETED_STATUSES.has(o.status)).length,
  };

  const driverCostByOrder = useMemo(() => {
    const map = new Map();
    orderSegments.forEach((segment) => {
      const status =
        segment.price_status ||
        (segment.price !== null && segment.price !== undefined && segment.price !== ''
          ? 'approved'
          : 'pending');
      if (status !== 'approved') return;
      const value = Number.parseFloat(segment.price);
      if (!Number.isFinite(value)) return;
      map.set(segment.order_id, (map.get(segment.order_id) || 0) + value);
    });
    return map;
  }, [orderSegments]);

  const fuelAdvanceByOrder = useMemo(() => {
    const map = new Map();
    financeChecklists.forEach((checklist) => {
      if (!checklist?.order_id || !Array.isArray(checklist.expenses)) return;
      const totalFuel = checklist.expenses.reduce((sum, expense) => {
        if (expense?.type !== 'fuel') return sum;
        const amount = Number.parseFloat(String(expense.amount || '').replace(',', '.'));
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      if (!totalFuel) return;
      map.set(checklist.order_id, (map.get(checklist.order_id) || 0) + totalFuel);
    });
    return map;
  }, [financeChecklists]);

  const financialOverview = useMemo(() => {
    return rangeOrders
      .filter((order) => COMPLETED_STATUSES.has(order.status))
      .reduce(
        (acc, order) => {
          const safeRevenue = parseAmount(order.driver_price);
          const driverCost = driverCostByOrder.get(order.id) || 0;
          const fuelAdvance = fuelAdvanceByOrder.get(order.id) || 0;
          acc.tours += 1;
          acc.revenue += safeRevenue;
          acc.driverCost += driverCost;
          acc.fuelAdvance += fuelAdvance;
          acc.profit += safeRevenue - driverCost;
          return acc;
        },
        { tours: 0, revenue: 0, driverCost: 0, fuelAdvance: 0, profit: 0 }
      );
  }, [rangeOrders, driverCostByOrder, fuelAdvanceByOrder]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);

  useEffect(() => {
    let active = true;
    appClient.auth.getCurrentUser().then((user) => {
      if (active) setCurrentUser(user);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const companyKey = currentUser?.company_id || currentUser?.id || 'global';
    const monthKey = format(new Date(), 'yyyy-MM');
    const storageKey = `avo:monthly-profit-target:${companyKey}:${monthKey}`;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(storageKey);
    setProfitTargetSaved(saved || '');
  }, [currentUser]);

  const profitTargetValue = parseAmount(profitTargetSaved);

  const currentMonthProfit = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return orders
      .filter((order) => COMPLETED_STATUSES.has(order.status))
      .reduce((sum, order) => {
        const date = new Date(toDateKey(order.dropoff_date) || toDateKey(order.pickup_date) || toDateKey(order.created_date));
        if (!date || Number.isNaN(date.getTime()) || date < start || date > end) return sum;
        const revenue = parseAmount(order.driver_price);
        const cost = driverCostByOrder.get(order.id) || 0;
        return sum + (revenue - cost);
      }, 0);
  }, [orders, driverCostByOrder]);

  const monthlyGoalReached = profitTargetValue > 0 && currentMonthProfit >= profitTargetValue;

  const getDueDateTime = (order) => {
    if (!order?.dropoff_date) return null;
    const time = order.dropoff_time ? `${order.dropoff_time}:00` : '23:59:00';
    const date = new Date(`${order.dropoff_date}T${time}`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const deliveryOrderIds = useMemo(() => {
    const ids = new Set();
    orders.forEach((order) => {
      if (DELIVERY_STATUSES.has(order.status) && order.assigned_driver_id) {
        ids.add(order.assigned_driver_id);
      }
    });
    return ids;
  }, [orders]);

  const dueStats = useMemo(() => {
    const now = new Date();
    const tomorrow = subDays(now, -1);
    let open = 0;
    let dueTomorrow = 0;
    let overdue = 0;

    orders.forEach((order) => {
      if (!order || order.status === 'cancelled') return;
      if (order.status !== 'completed') {
        open += 1;
      }
      if (order.status === 'completed') return;
      const dueAt = getDueDateTime(order);
      if (!dueAt) return;
      if (dueAt.getTime() < now.getTime()) {
        overdue += 1;
        return;
      }
      if (format(dueAt, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd')) {
        dueTomorrow += 1;
      }
    });

    return { open, dueTomorrow, overdue };
  }, [orders]);

  const quickMatches = useMemo(() => {
    const needle = quickSearch.trim().toLowerCase();
    if (!needle) return [];
    return orders.filter((order) => {
      const haystack = [
        order.order_number,
        order.customer_order_number,
        order.license_plate,
        order.vehicle_brand,
        order.vehicle_model,
        order.vin,
        order.pickup_address,
        order.pickup_city,
        order.pickup_postal_code,
        order.dropoff_address,
        order.dropoff_city,
        order.dropoff_postal_code,
        order.customer_name,
        order.assigned_driver_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    }).slice(0, 6);
  }, [orders, quickSearch]);

  const rangeLabel = useMemo(() => {
    const parse = (value) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return format(date, 'dd.MM.yyyy', { locale: de });
    };
    const fromLabel = parse(dateFrom);
    const toLabel = parse(dateTo);
    if (fromLabel && toLabel) return `${fromLabel} – ${toLabel}`;
    return fromLabel || toLabel || 'Kein Zeitraum';
  }, [dateFrom, dateTo]);

  const mapCounts = useMemo(() => {
    return {
      open: rangeOrders.filter((order) => OPEN_STATUSES.includes(order.status)).length,
      inDelivery: rangeOrders.filter((order) => DELIVERY_STATUSES.has(order.status)).length,
    };
  }, [rangeOrders]);

  const mapOrders = useMemo(() => {
    return rangeOrders.filter((order) => {
      const pickup = [order.pickup_address, order.pickup_postal_code, order.pickup_city]
        .filter(Boolean)
        .join(", ")
        .trim();
      const dropoff = [order.dropoff_address, order.dropoff_postal_code, order.dropoff_city]
        .filter(Boolean)
        .join(", ")
        .trim();
      if (!pickup || !dropoff) return false;
      if (mapMode === 'open') return OPEN_STATUSES.includes(order.status);
      if (mapMode === 'in_transit') return DELIVERY_STATUSES.has(order.status);
      return true;
    });
  }, [rangeOrders, mapMode]);

  const recentOrders = mapOrders.slice(0, 8);

  useEffect(() => {
    if (!mapOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !mapOrders.some(order => order.id === selectedOrderId)) {
      setSelectedOrderId(mapOrders[0].id);
    }
  }, [mapOrders, selectedOrderId]);

  const selectedOrder = mapOrders.find(order => order.id === selectedOrderId);

  const StatCard = ({ title, value, icon: Icon, color, subtext, onClick }) => (
    <Card
      className="relative overflow-hidden border border-slate-200/80 bg-white shadow-[0_20px_40px_-30px_rgba(15,23,42,0.6)] transition-transform hover:-translate-y-0.5"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className={`absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 ${color} rounded-full opacity-10`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
            <p className="text-3xl font-semibold text-slate-900">{value}</p>
            {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color} bg-opacity-15`}>
            <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const setTodayRange = () => {
    setDateFrom(todayKey);
    setDateTo(todayKey);
  };

  const setLastSevenDays = () => {
    const end = new Date();
    const start = subDays(end, 6);
    setDateFrom(format(start, 'yyyy-MM-dd'));
    setDateTo(format(end, 'yyyy-MM-dd'));
  };

  const statisticsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const query = params.toString();
    return `${createPageUrl('Statistics')}${query ? `?${query}` : ''}`;
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white shadow-[0_30px_60px_-40px_rgba(15,23,42,0.8)]">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-blue-200">AVO SYSTEM</p>
              <h1 className="text-3xl font-semibold tracking-tight mt-2">Dashboard</h1>
              <p className="text-sm text-slate-300">Übersicht aller Aktivitäten, Aufträge und Routen</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-200">
                Zeitraum: {rangeLabel}
              </div>
              <Link to={createPageUrl('Orders') + '?new=true'}>
                <Button className="bg-blue-500 text-white hover:bg-blue-600">
                  <Truck className="w-4 h-4 mr-2" />
                  Neuer Auftrag
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Card className="border border-slate-200/80 bg-white/90 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.6)]">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Search className="w-4 h-4 text-[#1e3a5f]" />
              Schnellzugriff auf Aufträge
            </div>
            <div className="relative w-full md:max-w-sm">
              <Input
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Auftrag, Kennzeichen, Kunde, Stadt..."
                className="w-full bg-white pr-3"
              />
            </div>
          </div>
          {quickSearch.trim() ? (
            <div className="mt-4 space-y-2">
              {quickMatches.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Keine Treffer für &quot;{quickSearch}&quot;.
                </div>
              ) : (
                quickMatches.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm transition hover:border-blue-200 hover:bg-blue-50"
                    onClick={() => navigate(`${createPageUrl('Orders')}?id=${order.id}`)}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{order.order_number || 'Unbekannter Auftrag'}</p>
                      <p className="text-xs text-slate-500">
                        {order.pickup_city || order.pickup_postal_code || 'Start'} → {order.dropoff_city || order.dropoff_postal_code || 'Ziel'}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </button>
                ))
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-slate-200/80 bg-white/90 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.6)]">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="w-5 h-5 text-[#1e3a5f]" />
            <div>
              <p className="text-sm font-medium">Zeitraum auswählen</p>
              <p className="text-xs text-slate-500">Daten nach Abhol- oder Erstellungsdatum</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-slate-400">bis</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={setTodayRange}
            >
              Heute
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={setLastSevenDays}
            >
              Letzte 7 Tage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={() => {
                const end = new Date();
                const start = subDays(end, 13);
                setDateFrom(format(start, 'yyyy-MM-dd'));
                setDateTo(format(end, 'yyyy-MM-dd'));
              }}
            >
              Letzte 14 Tage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={() => {
                const end = new Date();
                const start = subDays(end, 29);
                setDateFrom(format(start, 'yyyy-MM-dd'));
                setDateTo(format(end, 'yyyy-MM-dd'));
              }}
            >
              Letzte 30 Tage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={() => {
                const now = new Date();
                setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'));
                setDateTo(format(endOfMonth(now), 'yyyy-MM-dd'));
              }}
            >
              Dieser Monat
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"
              onClick={() => {
                const lastMonth = subDays(startOfMonth(new Date()), 1);
                setDateFrom(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
                setDateTo(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
              }}
            >
              Letzter Monat
            </Button>
            <Button
              variant={onlyDue ? "default" : "outline"}
              size="sm"
              className={onlyDue ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : "border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white"}
              onClick={() => setOnlyDue((prev) => !prev)}
            >
              Nur fällige Aufträge
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Aktive Fahrer aktuell" 
          value={deliveryOrderIds.size} 
          icon={Users}
          color="bg-blue-600"
          subtext="Fahrer in Lieferung"
          onClick={() => navigate(`${createPageUrl('Orders')}?list=active&status=in_transit`)}
        />
        <StatCard 
          title="Aufträge offen" 
          value={dueStats.open} 
          icon={Truck}
          color="bg-slate-900"
          subtext="In Bearbeitung"
          onClick={() => navigate(`${createPageUrl('Orders')}?list=active`)}
        />
        <StatCard 
          title="Noch 1 Tag Zeit" 
          value={dueStats.dueTomorrow} 
          icon={AlertCircle}
          color="bg-blue-500"
          subtext="Morgen fällig"
          onClick={() => navigate(`${createPageUrl('Orders')}?list=active&due=tomorrow`)}
        />
        <StatCard 
          title="Überfällig" 
          value={dueStats.overdue} 
          icon={AlertCircle}
          color="bg-red-600"
          subtext="Sofort prüfen"
          onClick={() => navigate(`${createPageUrl('Orders')}?list=active&due=overdue`)}
        />
      </div>

      <Card className="border border-slate-200/80 bg-white/90 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.6)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">Finanz-Übersicht</CardTitle>
              <p className="text-sm text-slate-500">Abgeschlossene Touren im gewählten Zeitraum</p>
            </div>
            <Link to={statisticsUrl}>
              <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                <BarChart3 className="mr-2 h-4 w-4" />
                Statistik öffnen
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Touren abgeschlossen</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{financialOverview.tours}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Umsatz</p>
              <p className="mt-1 text-xl font-semibold text-emerald-800">{formatCurrency(financialOverview.revenue)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Fahrer-Kosten</p>
              <p className="mt-1 text-xl font-semibold text-amber-800">{formatCurrency(financialOverview.driverCost)}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">Gewinn</p>
              <p className="mt-1 text-xl font-semibold text-blue-800">{formatCurrency(financialOverview.profit)}</p>
              <div className="mt-1 flex items-center gap-1 text-xs text-blue-700">
                <span>
                  Ziel: {profitTargetValue > 0 ? formatCurrency(profitTargetValue) : '—'}
                </span>
                {monthlyGoalReached ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : null}
              </div>
              {monthlyGoalReached ? (
                <p className="mt-1 text-xs text-emerald-600">Glückwunsch. Sie haben Ihr Ziel erreicht.</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Getankt (Vorkasse)</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{formatCurrency(financialOverview.fuelAdvance)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tank-Belege werden als Vorkasse ausgewiesen und nicht als Kosten vom Gewinn abgezogen.
          </p>
        </CardContent>
      </Card>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Overview */}
        <Card className="lg:col-span-2 border border-slate-200/80 bg-white/90 shadow-[0_24px_50px_-35px_rgba(15,23,42,0.6)]">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">Tagesrouten & Übersicht</CardTitle>
              <p className="text-sm text-slate-500">Klicke auf einen Auftrag, um die Route zu sehen</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={createPageUrl('Orders')}>
                <Button variant="ghost" size="sm">
                  Alle anzeigen
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : rangeOrders.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Truck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>Keine Aufträge im gewählten Zeitraum</p>
                <Link to={createPageUrl('Orders') + '?new=true'}>
                  <Button variant="outline" size="sm" className="mt-3">
                    Ersten Auftrag erstellen
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <Route className="w-4 h-4 text-[#1e3a5f]" />
                    <span>Routenansicht (Mapbox)</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={mapMode === 'open' ? 'default' : 'outline'}
                        className={mapMode === 'open' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                        onClick={() => setMapMode('open')}
                      >
                        Offen ({mapCounts.open})
                      </Button>
                      <Button
                        size="sm"
                        variant={mapMode === 'in_transit' ? 'default' : 'outline'}
                        className={mapMode === 'in_transit' ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                        onClick={() => setMapMode('in_transit')}
                      >
                        In Lieferung ({mapCounts.inDelivery})
                      </Button>
                    </div>
                  </div>
                  <OrdersMap
                    orders={mapOrders}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={setSelectedOrderId}
                  />
                  {selectedOrder && (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">{selectedOrder.order_number}</p>
                          <p className="text-slate-500">
                            {selectedOrder.pickup_city || 'Start'} → {selectedOrder.dropoff_city || 'Ziel'}
                          </p>
                        </div>
                        <StatusBadge status={selectedOrder.status} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {recentOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      Für die Kartenansicht fehlen Adressen oder Aufträge.
                    </div>
                  ) : (
                    recentOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`w-full text-left flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-all ${
                          order.id === selectedOrderId
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-[#1e3a5f]" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{order.order_number}</p>
                            <p className="text-sm text-slate-500">
                              {order.pickup_city || 'Start'} → {order.dropoff_city || 'Ziel'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={order.status} />
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Info */}
        <div className="space-y-6">
          {/* Pending Orders Alert */}
          {stats.pendingOrders > 0 && (
          <Card className="border-blue-200 bg-blue-50/90 shadow-[0_16px_30px_-20px_rgba(30,58,95,0.3)]">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-700 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">{stats.pendingOrders} Auftrag{stats.pendingOrders > 1 ? 'e' : ''} warten</p>
                    <p className="text-sm text-slate-700 mt-1">
                      Aufträge ohne Fahrerzuweisung
                    </p>
                    <Link to={createPageUrl('Orders') + '?status=new'}>
                      <Button size="sm" variant="outline" className="mt-3 border-blue-200 text-blue-700 hover:bg-blue-100">
                        Jetzt zuweisen
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card className="border border-slate-200/80 bg-white/90 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.55)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Letzte Protokolle</CardTitle>
            </CardHeader>
            <CardContent>
              {checklistsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : checklists.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Noch keine Protokolle
                </p>
              ) : (
                <div className="space-y-3">
                  {checklists.slice(0, 5).map((checklist) => (
                    <div key={checklist.id} className="flex items-center gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full ${checklist.type === 'pickup' ? 'bg-blue-500' : 'bg-green-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{checklist.order_number}</p>
                        <p className="text-gray-500 text-xs">
                          {checklist.driver_name} • {checklist.type === 'pickup' ? 'Abholung' : 'Abgabe'}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {checklist.datetime && format(new Date(checklist.datetime), 'dd.MM.', { locale: de })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card className="border border-slate-200/80 bg-white/90 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.55)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Schnellzugriff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to={createPageUrl('Orders') + '?new=true'} className="block">
                <Button variant="outline" className="w-full justify-start border-slate-300 hover:bg-slate-900 hover:text-white">
                  <Truck className="w-4 h-4 mr-2" />
                  Neuer Auftrag
                </Button>
              </Link>
              <Link to={createPageUrl('Drivers') + '?new=true'} className="block">
                <Button variant="outline" className="w-full justify-start border-slate-300 hover:bg-slate-900 hover:text-white">
                  <Users className="w-4 h-4 mr-2" />
                  Fahrer hinzufügen
                </Button>
              </Link>
              <Link to={createPageUrl('AppConnection')} className="block">
                <Button variant="outline" className="w-full justify-start border-slate-300 hover:bg-slate-900 hover:text-white">
                  <Settings className="w-4 h-4 mr-2" />
                  App & Einstellungen
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
