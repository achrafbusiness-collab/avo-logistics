import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  differenceInCalendarDays,
} from 'date-fns';
import { de } from 'date-fns/locale';

import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';

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
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [driverCostsOpen, setDriverCostsOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [targetMonth, setTargetMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [profitTargetInput, setProfitTargetInput] = useState('');
  const [profitTargetSaved, setProfitTargetSaved] = useState('');
  const targetLoadedRef = useRef(null);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['stats-orders'],
    queryFn: () =>
      appClient.entities.Order.list(
        '-created_date',
        2000,
        [
          'id',
          'status',
          'driver_price',
          'pickup_date',
          'dropoff_date',
          'created_date',
          'order_number',
          'customer_order_number',
          'pickup_city',
          'pickup_postal_code',
          'dropoff_city',
          'dropoff_postal_code',
          'distance_km',
          'license_plate',
          'customer_name',
        ].join(',')
      ),
  });

  const { data: orderSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ['stats-order-segments'],
    queryFn: () =>
      appClient.entities.OrderSegment.list(
        '-created_date',
        10000,
        [
          'id',
          'order_id',
          'driver_id',
          'driver_name',
          'segment_type',
          'start_location',
          'end_location',
          'distance_km',
          'created_date',
          'price',
          'price_status',
        ].join(',')
      ),
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['stats-drivers'],
    queryFn: () =>
      appClient.entities.Driver.list('-created_date', 1500, 'id,first_name,last_name,email'),
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery({
    queryKey: ['stats-checklists'],
    queryFn: () =>
      appClient.entities.Checklist.list('-created_date', 2000, 'id,order_id,expenses,created_date'),
  });

  const loading = ordersLoading || segmentsLoading || checklistsLoading || driversLoading;

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

  const ordersById = useMemo(() => {
    return new Map(orders.map((order) => [order.id, order]));
  }, [orders]);

  const driverCostByDay = useMemo(() => {
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
      const dateValue =
        segment.created_date ||
        segment.created_at ||
        segment.datetime ||
        segment.date ||
        null;
      const order = ordersById.get(segment.order_id);
      const date = orderDate(order) || toDate(dateValue);
      if (!date) continue;
      const key = format(date, 'yyyy-MM-dd');
      map.set(key, (map.get(key) || 0) + price);
    }
    return map;
  }, [orderSegments, ordersById]);

  const driversById = useMemo(() => {
    return new Map(drivers.map((driver) => [driver.id, driver]));
  }, [drivers]);

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
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const fuelAdvance = rows.reduce((sum, row) => sum + row.fuelAdvance, 0);
    let cost = 0;
    for (const [key, value] of driverCostByDay.entries()) {
      const date = new Date(`${key}T12:00:00`);
      if (Number.isNaN(date.getTime())) continue;
      if (date < range.from || date > range.to) continue;
      cost += value;
    }
    return {
      revenue,
      cost,
      fuelAdvance,
      profit: revenue - cost,
    };
  }, [rows, driverCostByDay, range.from, range.to]);

  const profitTargetValue = parseAmount(profitTargetSaved);
  const selectedTargetMonthDate = useMemo(
    () => new Date(`${targetMonth}-01T12:00:00`),
    [targetMonth]
  );
  const showTargetActions = profitTargetInput !== profitTargetSaved;

  const selectedMonthProfit = useMemo(() => {
    const start = startOfMonth(selectedTargetMonthDate);
    const end = endOfMonth(selectedTargetMonthDate);
    const revenue = orders
      .filter((order) => COMPLETED_STATUSES.has(order.status))
      .reduce((sum, order) => {
        const date = orderDate(order);
        if (!date || date < start || date > end) return sum;
        const revenue = parseAmount(order.driver_price);
        return sum + revenue;
      }, 0);
    let cost = 0;
    for (const [key, value] of driverCostByDay.entries()) {
      const date = new Date(`${key}T12:00:00`);
      if (Number.isNaN(date.getTime())) continue;
      if (date < start || date > end) continue;
      cost += value;
    }
    return revenue - cost;
  }, [orders, driverCostByDay, selectedTargetMonthDate]);

  const monthlyGoalReached = profitTargetValue > 0 && selectedMonthProfit >= profitTargetValue;
  const monthCompleted = useMemo(() => {
    const nextMonthStart = startOfMonth(new Date());
    return endOfMonth(selectedTargetMonthDate).getTime() < nextMonthStart.getTime();
  }, [selectedTargetMonthDate]);
  const showSuccess = monthlyGoalReached;
  const showFailure = profitTargetValue > 0 && monthCompleted && !monthlyGoalReached;

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

  const driverCostRows = useMemo(() => {
    return orderSegments
      .map((segment) => {
        const status =
          segment.price_status ||
          (segment.price !== null && segment.price !== undefined && segment.price !== ''
            ? 'approved'
            : 'pending');
        if (status !== 'approved') return null;
        const price = parseAmount(segment.price);
        if (!price) return null;
        const dateValue =
          segment.created_date ||
          segment.created_at ||
          segment.datetime ||
          segment.date ||
          null;
        const date = orderDate(order) || toDate(dateValue);
        if (!date || date < range.from || date > range.to) return null;
        const order = ordersById.get(segment.order_id);
        const driver = driversById.get(segment.driver_id);
        const driverName =
          segment.driver_name ||
          [driver?.first_name, driver?.last_name].filter(Boolean).join(' ') ||
          '-';
        const route = `${segment.start_location || order?.pickup_city || order?.pickup_address || 'Start'} -> ${
          segment.end_location || order?.dropoff_city || order?.dropoff_address || 'Ziel'
        }`;
        return {
          id: segment.id,
          date,
          driverName,
          licensePlate: order?.license_plate || '-',
          route,
          distanceKm: parseAmount(segment.distance_km || order?.distance_km),
          cost: price,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [orderSegments, ordersById, driversById, range.from, range.to]);

  const rangeLabel = `${format(range.from, 'dd.MM.yyyy')} - ${format(range.to, 'dd.MM.yyyy')}`;

  const buttonBase = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-900 hover:text-white";

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
            <p className="text-xs text-slate-400">
              Fahrer-Kosten werden nach dem Auftragsdatum ausgewertet (Fallback: Segmentdatum).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-200">
              Zeitraum: {rangeLabel}
            </div>
            <Link
              to={createPageUrl('Dashboard')}
              className="inline-flex items-center rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Zurück
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${buttonBase} ${period === item.value ? "bg-[#1e3a5f] text-white hover:bg-[#2d5a8a]" : ""}`}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const today = new Date();
              applyQuickRange(startOfDay(today), endOfDay(today));
            }}
          >
            Heute
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const yesterday = subDays(new Date(), 1);
              applyQuickRange(startOfDay(yesterday), endOfDay(yesterday));
            }}
          >
            Gestern
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const dayBefore = subDays(new Date(), 2);
              applyQuickRange(startOfDay(dayBefore), endOfDay(dayBefore));
            }}
          >
            Vorgestern
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const now = new Date();
              applyQuickRange(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
            }}
          >
            Diese Woche
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const now = new Date();
              const lastWeek = subDays(now, 7);
              applyQuickRange(startOfWeek(lastWeek, { weekStartsOn: 1 }), endOfWeek(lastWeek, { weekStartsOn: 1 }));
            }}
          >
            Letzte Woche
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const now = new Date();
              applyQuickRange(startOfMonth(now), endOfMonth(now));
              setTargetMonth(format(now, 'yyyy-MM'));
            }}
          >
            Dieser Monat
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={() => {
              const now = new Date();
              const lastMonth = subDays(startOfMonth(now), 1);
              applyQuickRange(startOfMonth(lastMonth), endOfMonth(lastMonth));
              setTargetMonth(format(lastMonth, 'yyyy-MM'));
            }}
          >
            Letzter Monat
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-slate-500">Zeitraum</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-slate-500">bis</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Abgeschlossene Touren</p>
          <p className="mt-2 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Umsatz</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.revenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Fahrer-Kosten</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.cost)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Gewinn</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.profit)}</p>
          <div className="mt-1 text-xs text-slate-500">
            Ziel: {profitTargetValue > 0 ? formatCurrency(profitTargetValue) : '—'}
          </div>
          {showSuccess ? (
            <p className="mt-1 text-xs text-emerald-600">Glückwunsch. Sie haben Ihr Ziel erreicht.</p>
          ) : showFailure ? (
            <p className="mt-1 text-xs text-red-600">
              Sie haben Ihr Ziel dieses Monats leider nicht erreicht.
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-xs text-slate-500">Monatliches Gewinnziel</p>
          <select
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={profitTargetInput}
            onChange={(e) => setProfitTargetInput(e.target.value)}
            placeholder="z. B. 5000"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {showTargetActions ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d5a8a]"
                onClick={handleConfirmTarget}
              >
                Bestätigen
              </button>
              <button
                type="button"
                className={buttonBase}
                onClick={handleDeleteTarget}
              >
                Löschen
              </button>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            Monatsergebnis: <span className="font-medium text-slate-700">{formatCurrency(selectedMonthProfit)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Getankt (Vorkasse)</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.fuelAdvance)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Aufträge im Zeitraum</h2>
          <button
            type="button"
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setOrdersOpen((prev) => !prev)}
          >
            {ordersOpen ? "Verbergen ▲" : "Anzeigen ▼"}
          </button>
        </div>
        {ordersOpen && (
          <div className="space-y-4 p-4">
            <div className="max-w-md">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Fahrer-Kosten im Zeitraum</h2>
          <button
            type="button"
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setDriverCostsOpen((prev) => !prev)}
          >
            {driverCostsOpen ? "Verbergen ▲" : "Anzeigen ▼"}
          </button>
        </div>
        {driverCostsOpen && (
          <div className="space-y-4 p-4">
            {loading ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Fahrer-Kosten werden geladen...
              </div>
            ) : driverCostRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Keine Fahrer-Kosten im ausgewählten Zeitraum.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Datum</th>
                      <th className="px-3 py-2 font-medium">Fahrer</th>
                      <th className="px-3 py-2 font-medium">Kennzeichen</th>
                      <th className="px-3 py-2 font-medium">Tour</th>
                      <th className="px-3 py-2 font-medium">Strecke</th>
                      <th className="px-3 py-2 font-medium">Fahrer-Kosten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverCostRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-3 py-3 text-slate-600">
                          {format(row.date, 'dd.MM.yyyy')}
                        </td>
                        <td className="px-3 py-3 text-slate-800">{row.driverName}</td>
                        <td className="px-3 py-3 text-slate-600">{row.licensePlate}</td>
                        <td className="px-3 py-3 text-slate-600">{row.route}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {row.distanceKm ? `${row.distanceKm} km` : '-'}
                        </td>
                        <td className="px-3 py-3 font-medium text-amber-700">
                          {formatCurrency(row.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
