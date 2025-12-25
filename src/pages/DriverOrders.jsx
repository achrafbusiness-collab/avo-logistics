import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StatusBadge from '@/components/ui/StatusBadge';

import { 
  Truck, 
  MapPin, 
  Calendar, 
  Clock,
  ArrowRight,
  Loader2,
  Play,
  CheckCircle2,
  Mail,
  Phone
} from 'lucide-react';

export default function DriverOrders() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
    } catch (e) {
      console.log('Not logged in');
    }
  };

  // Find driver by email
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list(),
    enabled: !!user,
  });

  const currentDriver = drivers.find(d => d.email === user?.email);

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['driver-orders', currentDriver?.id],
    queryFn: () => appClient.entities.Order.filter({ assigned_driver_id: currentDriver?.id }, '-created_date'),
    enabled: !!currentDriver,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['driver-checklists', currentDriver?.id],
    queryFn: () => appClient.entities.Checklist.filter({ driver_id: currentDriver?.id }),
    enabled: !!currentDriver,
  });

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });

  const appSettings = appSettingsList[0] || null;

  const activeOrders = allOrders.filter(o => ['assigned', 'accepted', 'pickup_started', 'in_transit', 'delivery_started'].includes(o.status));
  const completedOrders = allOrders.filter(o => o.status === 'completed');

  const getOrderChecklists = (orderId) => checklists.filter(c => c.order_id === orderId);

  const OrderCard = ({ order }) => {
    const orderChecklists = getOrderChecklists(order.id);
    const hasPickup = orderChecklists.some(c => c.type === 'pickup');
    const hasDropoff = orderChecklists.some(c => c.type === 'dropoff');

    return (
      <Link 
        to={createPageUrl('DriverChecklist') + `?orderId=${order.id}`}
        className="block"
      >
        <Card className="hover:shadow-lg transition-all border-l-4 border-l-[#1e3a5f]">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg text-[#1e3a5f]">{order.order_number}</span>
                  <StatusBadge status={order.status} size="sm" />
                </div>
                <p className="text-sm text-gray-500">{order.license_plate}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <Truck className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
                <p className="text-sm text-gray-500">{order.vehicle_color}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-blue-600">A</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{order.pickup_city || 'Abholung'}</p>
                  <p className="text-xs text-gray-500 truncate">{order.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-green-600">B</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{order.dropoff_city || 'Abgabe'}</p>
                  <p className="text-xs text-gray-500 truncate">{order.dropoff_address}</p>
                </div>
              </div>
            </div>

            {/* Date/Time */}
            {order.pickup_date && (
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(order.pickup_date), 'dd.MM.yyyy', { locale: de })}
                </span>
                {order.pickup_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {order.pickup_time}
                  </span>
                )}
              </div>
            )}

            {/* Progress */}
            <div className="flex gap-2 pt-3 border-t">
              <div className={`flex-1 p-2 rounded-lg text-center text-sm ${hasPickup ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${hasPickup ? 'text-green-600' : 'text-gray-400'}`} />
                Abholung
              </div>
              <div className={`flex-1 p-2 rounded-lg text-center text-sm ${hasDropoff ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${hasDropoff ? 'text-green-600' : 'text-gray-400'}`} />
                Abgabe
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!currentDriver) {
    return (
      <div className="p-6 text-center">
        <Truck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h2 className="text-xl font-bold mb-2">Kein Fahrerprofil gefunden</h2>
        <p className="text-gray-500">
          Dein Konto ist nicht mit einem Fahrerprofil verknüpft.
          Bitte kontaktiere den Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      
      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Hallo, {currentDriver.first_name || currentDriver.last_name || 'Fahrer'}!
        </h1>
        <p className="text-gray-500">
          {activeOrders.length === 0 
            ? 'Aktuell keine aktiven Aufträge' 
            : `${activeOrders.length} aktive${activeOrders.length === 1 ? 'r' : ''} Auftrag${activeOrders.length === 1 ? '' : 'e'}`
          }
        </p>
      </div>

      {appSettings && (appSettings.instructions || appSettings.support_phone || appSettings.support_email || appSettings.emergency_phone) && (
        <Card>
          <CardContent className="p-4 space-y-3 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-gray-900">
                {appSettings.company_name || 'AVO System'} – Fahrerhinweise
              </p>
              {appSettings.instructions && (
                <p className="mt-1 whitespace-pre-wrap">{appSettings.instructions}</p>
              )}
            </div>
            <div className="grid gap-2">
              {appSettings.support_phone && (
                <a href={`tel:${appSettings.support_phone}`} className="inline-flex items-center gap-2 text-blue-600">
                  <Phone className="w-4 h-4" />
                  Support: {appSettings.support_phone}
                </a>
              )}
              {appSettings.support_email && (
                <a href={`mailto:${appSettings.support_email}`} className="inline-flex items-center gap-2 text-blue-600">
                  <Mail className="w-4 h-4" />
                  {appSettings.support_email}
                </a>
              )}
              {appSettings.emergency_phone && (
                <a href={`tel:${appSettings.emergency_phone}`} className="inline-flex items-center gap-2 text-red-600">
                  <Phone className="w-4 h-4" />
                  Notfall: {appSettings.emergency_phone}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">
            Aktiv ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1">
            Erledigt ({completedOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : activeOrders.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">Keine aktiven Aufträge</p>
              </CardContent>
            </Card>
          ) : (
            activeOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 mt-4">
          {completedOrders.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">Noch keine erledigten Aufträge</p>
              </CardContent>
            </Card>
          ) : (
            completedOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
