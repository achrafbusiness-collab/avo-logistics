import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Truck, 
  Users, 
  ClipboardCheck, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Route
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from '@/components/ui/StatusBadge';
import OrdersMap from '@/components/dashboard/OrdersMap';
import { format, subDays } from 'date-fns';
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

export default function Dashboard() {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(todayKey);
  const [dateTo, setDateTo] = useState(todayKey);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [mapMode, setMapMode] = useState('open');

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

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list('-created_date', 100),
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
      return true;
    });
  }, [orders, dateFrom, dateTo]);

  // Kundenstatistik im Zeitraum
  const customerStats = {};
  rangeOrders.forEach(order => {
    if (order.customer_id) {
      customerStats[order.customer_id] = (customerStats[order.customer_id] || 0) + 1;
    }
  });
  const topCustomerId = Object.keys(customerStats).sort((a, b) => customerStats[b] - customerStats[a])[0];
  const topCustomer = customers.find(c => c.id === topCustomerId);
  const topCustomerCount = topCustomerId ? customerStats[topCustomerId] : 0;

  // Aktive Fahrer im Zeitraum (mit Aufträgen)
  const rangeDriverIds = new Set(rangeOrders.map(o => o.assigned_driver_id).filter(Boolean));
  const activeDriversRange = rangeDriverIds.size;

  const stats = {
    totalOrders: orders.length,
    activeOrders: rangeOrders.filter(o => ['new', 'assigned', 'pickup_started', 'in_transit', 'delivery_started'].includes(o.status)).length,
    completedOrders: rangeOrders.filter(o => ['completed', 'review', 'ready_for_billing', 'approved'].includes(o.status)).length,
    activeDrivers: drivers.filter(d => d.status === 'active').length,
    pendingOrders: rangeOrders.filter(o => o.status === 'new').length,
    rangeOrders: rangeOrders.length,
    activeDriversRange: activeDriversRange,
    topCustomer: topCustomer,
    topCustomerCount: topCustomerCount,
  };

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
    const openStatuses = ['new', 'assigned', 'pickup_started', 'delivery_started'];
    return {
      open: rangeOrders.filter((order) => openStatuses.includes(order.status)).length,
      inDelivery: rangeOrders.filter((order) => order.status === 'in_transit').length,
    };
  }, [rangeOrders]);

  const mapOrders = useMemo(() => {
    const openStatuses = ['new', 'assigned', 'pickup_started', 'delivery_started'];
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
      if (mapMode === 'open') return openStatuses.includes(order.status);
      if (mapMode === 'in_transit') return order.status === 'in_transit';
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

  const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
    <Card className="relative overflow-hidden border border-slate-200/80 bg-white shadow-[0_20px_40px_-30px_rgba(15,23,42,0.6)]">
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
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Aufträge im Zeitraum" 
          value={stats.rangeOrders} 
          icon={Truck}
          color="bg-blue-600"
          subtext={`${stats.activeOrders} aktiv`}
        />
        <StatCard 
          title="Aktive Fahrer im Zeitraum" 
          value={stats.activeDriversRange} 
          icon={Users}
          color="bg-slate-900"
          subtext={`${stats.activeDrivers} Fahrer verfügbar`}
        />
        <StatCard 
          title="Top-Kunde heute" 
          value={stats.topCustomerCount} 
          icon={TrendingUp}
          color="bg-blue-500"
          subtext={stats.topCustomer ? (stats.topCustomer.company_name || `${stats.topCustomer.first_name} ${stats.topCustomer.last_name}`) : 'Noch keine Aufträge'}
        />
        <StatCard 
          title="Abgeschlossen" 
          value={stats.completedOrders} 
          icon={CheckCircle2}
          color="bg-slate-700"
          subtext="Gesamt"
        />
      </div>

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
              <Link to={createPageUrl('Routes')}>
                <Button variant="outline" size="sm">
                  Routenansicht
                </Button>
              </Link>
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
                      Fuer die Kartenansicht fehlen Adressen oder Auftraege.
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
              <Link to={createPageUrl('Search')} className="block">
                <Button variant="outline" className="w-full justify-start border-slate-300 hover:bg-slate-900 hover:text-white">
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Protokolle suchen
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
