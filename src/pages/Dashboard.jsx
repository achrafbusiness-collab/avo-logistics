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
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';

const mapSlots = [
  { x: 12, y: 20 },
  { x: 28, y: 35 },
  { x: 45, y: 22 },
  { x: 62, y: 40 },
  { x: 78, y: 26 },
  { x: 22, y: 62 },
  { x: 40, y: 70 },
  { x: 58, y: 62 },
  { x: 74, y: 72 },
];

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
    activeOrders: rangeOrders.filter(o => ['new', 'assigned', 'accepted', 'pickup_started', 'in_transit', 'delivery_started'].includes(o.status)).length,
    completedOrders: rangeOrders.filter(o => o.status === 'completed').length,
    activeDrivers: drivers.filter(d => d.status === 'active').length,
    pendingOrders: rangeOrders.filter(o => o.status === 'new').length,
    rangeOrders: rangeOrders.length,
    activeDriversRange: activeDriversRange,
    topCustomer: topCustomer,
    topCustomerCount: topCustomerCount,
  };

  const recentOrders = rangeOrders.slice(0, 8);
  const mappedRoutes = useMemo(() => {
    return rangeOrders.map((order, index) => {
      const start = mapSlots[index % mapSlots.length];
      const end = mapSlots[(index + 3) % mapSlots.length];
      return { order, start, end };
    });
  }, [rangeOrders]);

  useEffect(() => {
    if (!mappedRoutes.length) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !mappedRoutes.some(route => route.order.id === selectedOrderId)) {
      setSelectedOrderId(mappedRoutes[0].order.id);
    }
  }, [mappedRoutes, selectedOrderId]);

  const selectedRoute = mappedRoutes.find(route => route.order.id === selectedOrderId);

  const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
    <Card className="relative overflow-hidden border border-slate-200/70 bg-white shadow-sm">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Übersicht aller Aktivitäten und Routen</p>
        </div>
        <Link to={createPageUrl('Orders') + '?new=true'}>
          <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
            <Truck className="w-4 h-4 mr-2" />
            Neuer Auftrag
          </Button>
        </Link>
      </div>

      <Card className="border border-slate-200/70 bg-white shadow-sm">
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
            <Button variant="outline" size="sm" onClick={setTodayRange}>
              Heute
            </Button>
            <Button variant="outline" size="sm" onClick={setLastSevenDays}>
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
          color="bg-blue-500"
          subtext={`${stats.activeOrders} aktiv`}
        />
        <StatCard 
          title="Aktive Fahrer im Zeitraum" 
          value={stats.activeDriversRange} 
          icon={Users}
          color="bg-green-500"
          subtext={`${stats.activeDrivers} Fahrer verfügbar`}
        />
        <StatCard 
          title="Top-Kunde heute" 
          value={stats.topCustomerCount} 
          icon={TrendingUp}
          color="bg-purple-500"
          subtext={stats.topCustomer ? (stats.topCustomer.company_name || `${stats.topCustomer.first_name} ${stats.topCustomer.last_name}`) : 'Noch keine Aufträge'}
        />
        <StatCard 
          title="Abgeschlossen" 
          value={stats.completedOrders} 
          icon={CheckCircle2}
          color="bg-orange-500"
          subtext="Gesamt"
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Overview */}
        <Card className="lg:col-span-2 border border-slate-200/70 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">Tagesrouten & Übersicht</CardTitle>
              <p className="text-sm text-slate-500">Klicke auf einen Auftrag, um die Route zu sehen</p>
            </div>
            <Link to={createPageUrl('Orders')}>
              <Button variant="ghost" size="sm">
                Alle anzeigen
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
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
                <div className="relative min-h-[280px] rounded-2xl bg-slate-950 p-4 text-white shadow-inner">
                  <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_55%)]" />
                  <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.8),_transparent_65%)]" />
                  <div className="relative flex items-center gap-2 text-sm text-white/70">
                    <Route className="w-4 h-4" />
                    Routenansicht
                  </div>
                  <div className="relative mt-4 h-48 rounded-xl border border-white/10 bg-white/5">
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {selectedRoute && (
                        <line
                          x1={selectedRoute.start.x}
                          y1={selectedRoute.start.y}
                          x2={selectedRoute.end.x}
                          y2={selectedRoute.end.y}
                          stroke="rgba(59,130,246,0.8)"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      )}
                    </svg>
                    {mappedRoutes.map((route) => (
                      <button
                        key={route.order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(route.order.id)}
                        className={`absolute h-3 w-3 rounded-full border ${
                          route.order.id === selectedOrderId
                            ? 'border-blue-200 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]'
                            : 'border-white/60 bg-white/40'
                        }`}
                        style={{
                          left: `${route.start.x}%`,
                          top: `${route.start.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        aria-label={`Route ${route.order.order_number}`}
                      />
                    ))}
                    {selectedRoute && (
                      <div
                        className="absolute h-4 w-4 rounded-full border border-blue-200 bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                        style={{
                          left: `${selectedRoute.end.x}%`,
                          top: `${selectedRoute.end.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    )}
                  </div>
                  {selectedRoute && (
                    <div className="relative mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <p className="font-semibold">{selectedRoute.order.order_number}</p>
                      <p className="text-white/70">
                        {selectedRoute.order.pickup_city || 'Start'} → {selectedRoute.order.dropoff_city || 'Ziel'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {recentOrders.map((order) => (
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
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Info */}
        <div className="space-y-6">
          {/* Pending Orders Alert */}
          {stats.pendingOrders > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-900">{stats.pendingOrders} Auftrag{stats.pendingOrders > 1 ? 'e' : ''} warten</p>
                    <p className="text-sm text-orange-700 mt-1">
                      Aufträge ohne Fahrerzuweisung
                    </p>
                    <Link to={createPageUrl('Orders') + '?status=new'}>
                      <Button size="sm" variant="outline" className="mt-3 border-orange-300 text-orange-700 hover:bg-orange-100">
                        Jetzt zuweisen
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card>
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Schnellzugriff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to={createPageUrl('Orders') + '?new=true'} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Truck className="w-4 h-4 mr-2" />
                  Neuer Auftrag
                </Button>
              </Link>
              <Link to={createPageUrl('Drivers') + '?new=true'} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Fahrer hinzufügen
                </Button>
              </Link>
              <Link to={createPageUrl('Search')} className="block">
                <Button variant="outline" className="w-full justify-start">
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
