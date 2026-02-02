import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Search,
  TrendingUp,
  Truck,
  Wallet,
  Coins,
  Fuel,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const COMPLETED_STATUSES = new Set(['completed', 'review', 'ready_for_billing', 'approved']);

const PERIODS = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'custom', label: 'Eigener Zeitraum' },
];

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateInput = (date) => format(date, 'yyyy-MM-dd');

const parseAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value || 0);

const getRangeForPeriod = (period, customFrom, customTo) => {
  const now = new Date();
  const rawFrom = toDate(customFrom);
  const rawTo = toDate(customTo);
  const safeFrom = rawFrom ? startOfDay(rawFrom) : startOfMonth(now);
  const safeTo = rawTo ? endOfDay(rawTo) : endOfDay(now);
  const from = safeFrom.getTime() <= safeTo.getTime() ? safeFrom : startOfDay(safeTo);
  const to = safeFrom.getTime() <= safeTo.getTime() ? safeTo : endOfDay(safeFrom);
  const days = Math.abs(differenceInCalendarDays(to, from));
  let bucket = 'day';
  if (period === 'weekly') {
    bucket = 'week';
  } else if (period === 'monthly') {
    bucket = 'month';
  } else if (period === 'yearly') {
    bucket = 'year';
  } else if (period === 'custom') {
    bucket = days > 92 ? 'month' : 'day';
  }
  return { from, to, bucket };
};

const orderDate = (order) =>
  toDate(order?.dropoff_date) || toDate(order?.pickup_date) || toDate(order?.created_date);

export default function Statistics() {
  const [searchParams] = useSearchParams();
  const defaultLastWeek = useMemo(() => {
    const now = new Date();
    const lastWeek = subDays(now, 7);
    return {
      from: startOfWeek(lastWeek, { weekStartsOn: 1 }),
      to: endOfWeek(lastWeek, { weekStartsOn: 1 }),
    };
  }, []);
  const [period, setPeriod] = useState('daily');
  const [customFrom, setCustomFrom] = useState(() => toDateInput(defaultLastWeek.from));
  const [customTo, setCustomTo] = useState(() => toDateInput(defaultLastWeek.to));
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [targetMonth, setTargetMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [profitTargetInput, setProfitTargetInput] = useState('');
  const [profitTargetSaved, setProfitTargetSaved] = useState('');
  const [seriesVisible, setSeriesVisible] = useState({
    revenue: true,
    cost: true,
    profit: true,
  });
  const targetLoadedRef = useRef(null);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['stats-orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 5000),
  });

  const { data: orderSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ['stats-order-segments'],
    queryFn: () => appClient.entities.OrderSegment.list('-created_date', 5000),
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery({
    queryKey: ['stats-checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 5000),
  });

  const loading = ordersLoading || segmentsLoading || checklistsLoading;

  const range = useMemo(
    () => getRangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  useEffect(() => {
    let active = true;
    appClient.auth.getCurrentUser().then((user) => {
      if (active) setCurrentUser(user);
    });
    return () => {
      active = false;
    };
  }, []);

  const monthOptions = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(year, index, 1);
      return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM', { locale: de }),
      };
    });
  }, []);

  const targetStorageKey = useMemo(() => {
    const companyKey = currentUser?.company_id || currentUser?.id || 'global';
    return `avo:monthly-profit-target:${companyKey}:${targetMonth}`;
  }, [currentUser, targetMonth]);

  useEffect(() => {
    if (!targetStorageKey || targetLoadedRef.current === targetStorageKey) return;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(targetStorageKey);
    if (saved !== null) {
      setProfitTargetSaved(saved);
      setProfitTargetInput(saved);
    } else {
      setProfitTargetSaved('');
      setProfitTargetInput('');
    }
    targetLoadedRef.current = targetStorageKey;
  }, [targetStorageKey]);

  const handleConfirmTarget = () => {
    if (!targetStorageKey || typeof window === 'undefined') return;
    setProfitTargetSaved(profitTargetInput);
    window.localStorage.setItem(targetStorageKey, profitTargetInput);
  };

  const handleDeleteTarget = () => {
    if (!targetStorageKey || typeof window === 'undefined') return;
    setProfitTargetInput('');
    setProfitTargetSaved('');
    window.localStorage.removeItem(targetStorageKey);
  };

  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam || toParam) {
      if (fromParam) setCustomFrom(fromParam);
      if (toParam) setCustomTo(toParam);
    }
  }, [searchParams.toString()]);

  const applyQuickRange = (fromDate, toDate) => {
    setCustomFrom(toDateInput(fromDate));
    setCustomTo(toDateInput(toDate));
  };

  const driverCostByOrder = useMemo(() => {
    const map = new Map();
    for (const segment of orderSegments) {
      const status =
        segment.price_status ||
        (segment.price !== null && segment.price !== undefined && segment.price !== ''
          ? 'approved'
          : 'pending');
      if (status !== 'approved') continue;
      const price = parseAmount(segment.price);
      if (!price) continue;
      const prev = map.get(segment.order_id) || 0;
      map.set(segment.order_id, prev + price);
    }
    return map;
  }, [orderSegments]);

  const fuelByOrder = useMemo(() => {
    const map = new Map();
    for (const checklist of checklists) {
      if (!checklist?.order_id || !Array.isArray(checklist.expenses)) continue;
      const fuelTotal = checklist.expenses.reduce((sum, expense) => {
        if (expense?.type !== 'fuel') return sum;
        return sum + parseAmount(expense?.amount);
      }, 0);
      if (!fuelTotal) continue;
      const prev = map.get(checklist.order_id) || 0;
      map.set(checklist.order_id, prev + fuelTotal);
    }
    return map;
  }, [checklists]);

  const rows = useMemo(() => {
    return orders
      .filter((order) => COMPLETED_STATUSES.has(order.status))
      .map((order) => {
        const date = orderDate(order);
        if (!date) return null;
        if (date < range.from || date > range.to) return null;

        const revenue = parseAmount(order.driver_price);
        const cost = driverCostByOrder.get(order.id) || 0;
        const fuelAdvance = fuelByOrder.get(order.id) || 0;
        const profit = revenue - cost;

        return {
          id: order.id,
          orderNumber: order.order_number || '-',
          customerOrderNumber: order.customer_order_number || '',
          status: order.status,
          date,
          route: `${order.pickup_city || order.pickup_postal_code || 'Start'} -> ${
            order.dropoff_city || order.dropoff_postal_code || 'Ziel'
          }`,
          distanceKm: parseAmount(order.distance_km),
          revenue,
          cost,
          fuelAdvance,
          profit,
          licensePlate: order.license_plate || '-',
          customerName: order.customer_name || '-',
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [orders, range.from, range.to, driverCostByOrder, fuelByOrder]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.cost += row.cost;
        acc.fuelAdvance += row.fuelAdvance;
        acc.profit += row.profit;
        return acc;
      },
      { revenue: 0, cost: 0, fuelAdvance: 0, profit: 0 }
    );
  }, [rows]);

  const profitTargetValue = parseAmount(profitTargetSaved);
  const selectedTargetMonthDate = useMemo(
    () => new Date(`${targetMonth}-01T12:00:00`),
    [targetMonth]
  );
  const showTargetActions = profitTargetInput !== profitTargetSaved;

  const selectedMonthProfit = useMemo(() => {
    const start = startOfMonth(selectedTargetMonthDate);
    const end = endOfMonth(selectedTargetMonthDate);
    return orders
      .filter((order) => COMPLETED_STATUSES.has(order.status))
      .reduce((sum, order) => {
        const date = orderDate(order);
        if (!date || date < start || date > end) return sum;
        const revenue = parseAmount(order.driver_price);
        const cost = driverCostByOrder.get(order.id) || 0;
        return sum + (revenue - cost);
      }, 0);
  }, [orders, driverCostByOrder, selectedTargetMonthDate]);

  const monthlyGoalReached = profitTargetValue > 0 && selectedMonthProfit >= profitTargetValue;
  const monthCompleted = useMemo(() => {
    const nextMonthStart = startOfMonth(new Date());
    return endOfMonth(selectedTargetMonthDate).getTime() < nextMonthStart.getTime();
  }, [selectedTargetMonthDate]);
  const showSuccess = monthlyGoalReached;
  const showFailure = profitTargetValue > 0 && monthCompleted && !monthlyGoalReached;

  const chartConfig = useMemo(() => {
    const showWeekYear = range.from.getFullYear() !== range.to.getFullYear();
    const showMonthYear = range.from.getFullYear() !== range.to.getFullYear();

    const buildKeyLabel = (point) => {
      if (range.bucket === 'week') {
        const weekStart = startOfWeek(point, { weekStartsOn: 1 });
        const weekKey = format(weekStart, "RRRR-'W'II");
        const weekNumber = format(weekStart, 'II');
        return {
          key: weekKey,
          label: showWeekYear ? `KW ${weekNumber}/${format(weekStart, 'yy')}` : `KW ${weekNumber}`,
          monthKey: format(weekStart, 'yyyy-MM'),
          monthLabel: format(weekStart, 'MMM', { locale: de }),
        };
      }
      if (range.bucket === 'month') {
        const key = format(point, 'yyyy-MM');
        return {
          key,
          label: showMonthYear ? format(point, 'MMM yy', { locale: de }) : format(point, 'MMM', { locale: de }),
          monthKey: key,
          monthLabel: format(point, 'MMM', { locale: de }),
        };
      }
      if (range.bucket === 'year') {
        const key = format(point, 'yyyy');
        return { key, label: key, monthKey: null, monthLabel: null };
      }
      const key = format(point, 'yyyy-MM-dd');
      return {
        key,
        label: format(point, 'dd.MM', { locale: de }),
        monthKey: format(point, 'yyyy-MM'),
        monthLabel: format(point, 'MMM', { locale: de }),
      };
    };

    const points = (() => {
      if (range.bucket === 'week') {
        return eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
      }
      if (range.bucket === 'month') {
        return eachMonthOfInterval({ start: range.from, end: range.to });
      }
      if (range.bucket === 'year') {
        return eachYearOfInterval({ start: range.from, end: range.to });
      }
      return eachDayOfInterval({ start: range.from, end: range.to });
    })();

    const labelMap = new Map();
    const monthSeparators = [];
    let lastMonthKey = null;

    const map = new Map(
      points.map((point, index) => {
        const { key, label, monthKey, monthLabel } = buildKeyLabel(point);
        labelMap.set(key, label);
        if (range.bucket === 'week' && monthKey && monthKey !== lastMonthKey) {
          if (index !== 0) {
            monthSeparators.push({ key, label: monthLabel });
          }
          lastMonthKey = monthKey;
        }
        return [
          key,
          {
            key,
            label,
            revenue: 0,
            cost: 0,
            profit: 0,
          },
        ];
      })
    );

    for (const row of rows) {
      const key = (() => {
        if (range.bucket === 'week') {
          const weekStart = startOfWeek(row.date, { weekStartsOn: 1 });
          return format(weekStart, "RRRR-'W'II");
        }
        if (range.bucket === 'month') return format(row.date, 'yyyy-MM');
        if (range.bucket === 'year') return format(row.date, 'yyyy');
        return format(row.date, 'yyyy-MM-dd');
      })();
      const bucket = map.get(key);
      if (!bucket) continue;
      bucket.revenue += row.revenue;
      bucket.cost += row.cost;
      bucket.profit += row.profit;
    }

    return { data: Array.from(map.values()), labelMap, monthSeparators };
  }, [rows, range.bucket, range.from, range.to]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.orderNumber,
        row.customerOrderNumber,
        row.licensePlate,
        row.route,
        row.customerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, search]);

  const rangeLabel = `${format(range.from, 'dd.MM.yyyy')} - ${format(range.to, 'dd.MM.yyyy')}`;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white shadow-[0_30px_60px_-40px_rgba(15,23,42,0.8)]">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-blue-200">AVO SYSTEM</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Statistik</h1>
            <p className="text-sm text-slate-300">Umsatz, Fahrer-Kosten und Gewinn pro Zeitraum</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-200">
              Zeitraum: {rangeLabel}
            </div>
            <Link to={createPageUrl('Dashboard')}>
              <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                Zurück
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Card className="border border-slate-200/80 bg-white/90">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={period === item.value ? 'default' : 'outline'}
                className={period === item.value ? 'bg-[#1e3a5f] hover:bg-[#2d5a8a]' : ''}
                onClick={() => setPeriod(item.value)}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const today = new Date();
                applyQuickRange(startOfDay(today), endOfDay(today));
              }}
            >
              Heute
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const yesterday = subDays(new Date(), 1);
                applyQuickRange(startOfDay(yesterday), endOfDay(yesterday));
              }}
            >
              Gestern
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const dayBefore = subDays(new Date(), 2);
                applyQuickRange(startOfDay(dayBefore), endOfDay(dayBefore));
              }}
            >
              Vorgestern
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                applyQuickRange(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
              }}
            >
              Diese Woche
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const lastWeek = subDays(now, 7);
                applyQuickRange(startOfWeek(lastWeek, { weekStartsOn: 1 }), endOfWeek(lastWeek, { weekStartsOn: 1 }));
              }}
            >
              Letzte Woche
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                applyQuickRange(startOfMonth(now), endOfMonth(now));
                setTargetMonth(format(now, 'yyyy-MM'));
              }}
            >
              Dieser Monat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const lastMonth = subDays(startOfMonth(now), 1);
                applyQuickRange(startOfMonth(lastMonth), endOfMonth(lastMonth));
                setTargetMonth(format(lastMonth, 'yyyy-MM'));
              }}
            >
              Letzter Monat
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-slate-500">Zeitraum</span>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-44" />
            <span className="text-slate-500">bis</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-44" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card><CardContent className="p-5"><p className="text-xs text-slate-500">Abgeschlossene Touren</p><p className="mt-2 text-2xl font-semibold">{rows.length}</p><Truck className="mt-2 h-4 w-4 text-slate-400" /></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-slate-500">Umsatz</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.revenue)}</p><TrendingUp className="mt-2 h-4 w-4 text-emerald-500" /></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-slate-500">Fahrer-Kosten</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.cost)}</p><Wallet className="mt-2 h-4 w-4 text-amber-500" /></CardContent></Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">Gewinn</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.profit)}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <span>
                Ziel: {profitTargetValue > 0 ? formatCurrency(profitTargetValue) : '—'}
              </span>
              {showSuccess ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : null}
            </div>
            {showSuccess ? (
              <p className="mt-1 text-xs text-emerald-600">Glückwunsch. Sie haben Ihr Ziel erreicht.</p>
            ) : showFailure ? (
              <p className="mt-1 text-xs text-red-600">
                Sie haben Ihr Ziel dieses Monats leider nicht erreicht.
              </p>
            ) : null}
            <Coins className="mt-2 h-4 w-4 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-xs text-slate-500">Monatliches Gewinnziel</p>
            <Select value={targetMonth} onValueChange={setTargetMonth}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Monat auswählen" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              value={profitTargetInput}
              onChange={(e) => setProfitTargetInput(e.target.value)}
              placeholder="z. B. 5000"
            />
            {showTargetActions ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={handleConfirmTarget}
                >
                  Bestätigen
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeleteTarget}>
                  Löschen
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              Monatsergebnis: <span className="font-medium text-slate-700">{formatCurrency(selectedMonthProfit)}</span>
            </p>
          </CardContent>
        </Card>
        <Card><CardContent className="p-5"><p className="text-xs text-slate-500">Getankt (Vorkasse)</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.fuelAdvance)}</p><Fuel className="mt-2 h-4 w-4 text-slate-500" /></CardContent></Card>
      </div>

      <Card className="border border-slate-200/80 bg-white/90">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Verlauf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={seriesVisible.revenue} onCheckedChange={(checked) => setSeriesVisible((prev) => ({ ...prev, revenue: Boolean(checked) }))} />
              Umsatz
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={seriesVisible.cost} onCheckedChange={(checked) => setSeriesVisible((prev) => ({ ...prev, cost: Boolean(checked) }))} />
              Kosten
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={seriesVisible.profit} onCheckedChange={(checked) => setSeriesVisible((prev) => ({ ...prev, profit: Boolean(checked) }))} />
              Gewinn
            </label>
          </div>

          <div className="h-80">
            {chartConfig.data.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                Keine Daten im gewählten Zeitraum.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartConfig.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="key"
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => chartConfig.labelMap.get(value) || value}
                  />
                  <YAxis stroke="#64748b" tickFormatter={(value) => `${Math.round(value)}€`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(value) => chartConfig.labelMap.get(value) || value}
                    formatter={(value) => formatCurrency(Number(value || 0))}
                  />
                  <Legend />
                  {chartConfig.monthSeparators.map((separator) => (
                    <ReferenceLine
                      key={separator.key}
                      x={separator.key}
                      stroke="#cbd5f5"
                      strokeDasharray="4 4"
                      label={{
                        value: separator.label,
                        position: 'top',
                        fill: '#94a3b8',
                        fontSize: 11,
                      }}
                    />
                  ))}
                  {profitTargetValue > 0 ? (
                    <ReferenceLine
                      y={profitTargetValue}
                      stroke="#16a34a"
                      strokeDasharray="6 4"
                      label={{
                        value: "Ziel",
                        position: "right",
                        fill: "#16a34a",
                        fontSize: 11,
                      }}
                    />
                  ) : null}
                  {seriesVisible.revenue ? <Line type="monotone" dataKey="revenue" name="Umsatz" stroke="#10b981" strokeWidth={2.5} dot={false} /> : null}
                  {seriesVisible.cost ? <Line type="monotone" dataKey="cost" name="Kosten" stroke="#f59e0b" strokeWidth={2.5} dot={false} /> : null}
                  {seriesVisible.profit ? <Line type="monotone" dataKey="profit" name="Gewinn" stroke="#2563eb" strokeWidth={2.5} dot={false} /> : null}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/80 bg-white/90">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Aufträge im Zeitraum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Auftrag, Kennzeichen, Kunde oder Route suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Statistik wird geladen...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Keine passenden Aufträge gefunden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Auftrag</th>
                    <th className="px-3 py-2 font-medium">Datum</th>
                    <th className="px-3 py-2 font-medium">Strecke</th>
                    <th className="px-3 py-2 font-medium">Auftragspreis</th>
                    <th className="px-3 py-2 font-medium">Fahrer-Kosten</th>
                    <th className="px-3 py-2 font-medium">Gewinn</th>
                    <th className="px-3 py-2 font-medium">Getankt (Vorkasse)</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => setSelectedOrder(row)}
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{row.orderNumber}</p>
                        <p className="text-xs text-slate-500">{row.route}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{format(row.date, 'dd.MM.yyyy')}</td>
                      <td className="px-3 py-3 text-slate-600">{row.distanceKm ? `${row.distanceKm} km` : '-'}</td>
                      <td className="px-3 py-3 font-medium text-emerald-700">{formatCurrency(row.revenue)}</td>
                      <td className="px-3 py-3 font-medium text-amber-700">{formatCurrency(row.cost)}</td>
                      <td className="px-3 py-3 font-medium text-blue-700">{formatCurrency(row.profit)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(row.fuelAdvance)}</td>
                      <td className="px-3 py-3 text-right">
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Auftragsanalyse</DialogTitle>
            <DialogDescription>
              Detaillierte Statistik zum ausgewählten Auftrag.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{selectedOrder.orderNumber}</p>
                <p className="text-slate-600">{selectedOrder.route}</p>
                <p className="text-xs text-slate-500">{selectedOrder.customerName} • {selectedOrder.licensePlate}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Auftragspreis</p>
                  <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(selectedOrder.revenue)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Fahrer-Kosten</p>
                  <p className="mt-1 font-semibold text-amber-700">{formatCurrency(selectedOrder.cost)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Gewinn</p>
                  <p className="mt-1 font-semibold text-blue-700">{formatCurrency(selectedOrder.profit)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Getankt (Vorkasse)</p>
                  <p className="mt-1 font-semibold text-slate-700">{formatCurrency(selectedOrder.fuelAdvance)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <span className="text-slate-500">Strecke</span>
                <span className="font-medium text-slate-900">{selectedOrder.distanceKm ? `${selectedOrder.distanceKm} km` : '-'}</span>
              </div>
              <Link to={`${createPageUrl('Orders')}?id=${selectedOrder.id}`}>
                <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">Auftrag öffnen</Button>
              </Link>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
