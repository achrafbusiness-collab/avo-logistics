import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Truck, 
  Users, 
  ClipboardCheck, 
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function Dashboard() {
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

  // Heute-Filter
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => {
    const orderDate = o.created_date?.split('T')[0];
    return orderDate === today;
  });

  // Kundenstatistik für heute
  const customerStats = {};
  todayOrders.forEach(order => {
    if (order.customer_id) {
      customerStats[order.customer_id] = (customerStats[order.customer_id] || 0) + 1;
    }
  });
  const topCustomerId = Object.keys(customerStats).sort((a, b) => customerStats[b] - customerStats[a])[0];
  const topCustomer = customers.find(c => c.id === topCustomerId);
  const topCustomerCount = topCustomerId ? customerStats[topCustomerId] : 0;

  // Aktive Fahrer heute (mit Aufträgen)
  const todayDriverIds = new Set(todayOrders.map(o => o.assigned_driver_id).filter(Boolean));
  const activeDriversToday = todayDriverIds.size;

  const stats = {
    totalOrders: orders.length,
    activeOrders: orders.filter(o => ['new', 'assigned', 'accepted', 'pickup_started', 'in_transit', 'delivery_started'].includes(o.status)).length,
    completedOrders: orders.filter(o => o.status === 'completed').length,
    activeDrivers: drivers.filter(d => d.status === 'active').length,
    pendingOrders: orders.filter(o => o.status === 'new').length,
    todayOrders: todayOrders.length,
    activeDriversToday: activeDriversToday,
    topCustomer: topCustomer,
    topCustomerCount: topCustomerCount,
  };

  const recentOrders = orders.slice(0, 5);

  const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-shadow">
      <div className={`absolute top-0 right-0 w-32 h-32 transform translate-x-8 -translate-y-8 ${color} rounded-full opacity-10 group-hover:opacity-20 transition-opacity`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
            <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Übersicht aller Aktivitäten</p>
        </div>
        <Link to={createPageUrl('Orders') + '?new=true'}>
          <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
            <Truck className="w-4 h-4 mr-2" />
            Neuer Auftrag
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Aufträge heute" 
          value={stats.todayOrders} 
          icon={Truck}
          color="bg-blue-500"
          subtext={`${stats.activeOrders} aktiv insgesamt`}
        />
        <StatCard 
          title="Aktive Fahrer heute" 
          value={stats.activeDriversToday} 
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
        {/* Recent Orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Aktuelle Aufträge</CardTitle>
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
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Noch keine Aufträge vorhanden</p>
                <Link to={createPageUrl('Orders') + '?new=true'}>
                  <Button variant="outline" size="sm" className="mt-3">
                    Ersten Auftrag erstellen
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link 
                    key={order.id} 
                    to={createPageUrl('Orders') + `?id=${order.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-lg flex items-center justify-center">
                        <Truck className="w-5 h-5 text-[#1e3a5f]" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{order.order_number}</p>
                        <p className="text-sm text-gray-500">{order.license_plate} • {order.vehicle_brand} {order.vehicle_model}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={order.status} />
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </Link>
                ))}
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