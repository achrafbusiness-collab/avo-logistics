import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  ArrowLeft,
  MapPin,
  Phone,
  Truck,
  ClipboardList,
  Play,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Clock,
  Loader2
} from 'lucide-react';

export default function DriverChecklist() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  const [user, setUser] = useState(null);
  const [currentDriver, setCurrentDriver] = useState(null);

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

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list(),
    enabled: !!user,
  });

  useEffect(() => {
    if (drivers.length && user) {
      const driver = drivers.find(d => d.email === user.email);
      if (driver) {
        // Create full name field for compatibility
        driver.name = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
      }
      setCurrentDriver(driver);
    }
  }, [drivers, user]);

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orders = await appClient.entities.Order.filter({ id: orderId });
      return orders[0];
    },
    enabled: !!orderId,
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery({
    queryKey: ['order-checklists', orderId],
    queryFn: () => appClient.entities.Checklist.filter({ order_id: orderId }),
    enabled: !!orderId,
  });

  const pickupChecklist = checklists.find(c => c.type === 'pickup');
  const dropoffChecklist = checklists.find(c => c.type === 'dropoff');

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });

  const isLoading = orderLoading || checklistsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4">
        <Link to={createPageUrl('DriverOrders')}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <Card>
          <CardContent className="text-center py-12">
            <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Auftrag nicht gefunden</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white px-4 py-6">
        <Link to={createPageUrl('DriverOrders')} className="inline-flex items-center text-white/80 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zu Aufträge
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <p className="text-white/70">{order.license_plate}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Vehicle Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Fahrzeug
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Marke / Modell</p>
                <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
              </div>
              <div>
                <p className="text-gray-500">Farbe</p>
                <p className="font-medium">{order.vehicle_color || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">VIN</p>
                <p className="font-medium font-mono text-xs">{order.vin || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pickup */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">A</span>
                </div>
                <span className="font-semibold text-blue-900">Abholung</span>
              </div>
              <p className="font-medium">{order.pickup_address}</p>
              <p className="text-sm text-gray-600">{order.pickup_city}</p>
              {order.pickup_date && (
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
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
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(order.pickup_address + ' ' + order.pickup_city)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-blue-600 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                In Google Maps öffnen
              </a>
            </div>

            {/* Dropoff */}
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">B</span>
                </div>
                <span className="font-semibold text-green-900">Abgabe</span>
              </div>
              <p className="font-medium">{order.dropoff_address}</p>
              <p className="text-sm text-gray-600">{order.dropoff_city}</p>
              {order.dropoff_date && (
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(order.dropoff_date), 'dd.MM.yyyy', { locale: de })}
                  </span>
                  {order.dropoff_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {order.dropoff_time}
                    </span>
                  )}
                </div>
              )}
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(order.dropoff_address + ' ' + order.dropoff_city)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-green-600 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                In Google Maps öffnen
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Customer */}
        {order.customer_name && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kunde</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{order.customer_name}</p>
              {order.customer_phone && (
                <a 
                  href={`tel:${order.customer_phone}`}
                  className="inline-flex items-center gap-2 mt-2 text-blue-600"
                >
                  <Phone className="w-4 h-4" />
                  {order.customer_phone}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {order.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hinweise</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Checklist Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Protokolle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Pickup Checklist */}
            <div className={`p-4 rounded-lg border-2 ${pickupChecklist ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {pickupChecklist ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-blue-400" />
                  )}
                  <div>
                    <p className="font-semibold">Abholprotokoll</p>
                    {pickupChecklist ? (
                      <p className="text-sm text-green-700">
                        Erstellt am {format(new Date(pickupChecklist.datetime), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Noch nicht erstellt</p>
                    )}
                  </div>
                </div>
                <Link to={createPageUrl('DriverProtocol') + `?orderId=${order.id}&type=pickup${pickupChecklist ? `&checklistId=${pickupChecklist.id}` : ''}`}>
                  <Button 
                    size="sm"
                    variant={pickupChecklist ? 'outline' : 'default'}
                    className={!pickupChecklist ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  >
                    {pickupChecklist ? (
                      <>Anzeigen</>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        Starten
                      </>
                    )}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Dropoff Checklist */}
            <div className={`p-4 rounded-lg border-2 ${dropoffChecklist ? 'border-green-200 bg-green-50' : pickupChecklist ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {dropoffChecklist ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <div className={`w-6 h-6 rounded-full border-2 ${pickupChecklist ? 'border-green-400' : 'border-gray-300'}`} />
                  )}
                  <div>
                    <p className="font-semibold">Abgabeprotokoll</p>
                    {dropoffChecklist ? (
                      <p className="text-sm text-green-700">
                        Erstellt am {format(new Date(dropoffChecklist.datetime), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </p>
                    ) : pickupChecklist ? (
                      <p className="text-sm text-gray-500">Bereit zum Ausfüllen</p>
                    ) : (
                      <p className="text-sm text-gray-400">Zuerst Abholprotokoll erstellen</p>
                    )}
                  </div>
                </div>
                {(pickupChecklist || dropoffChecklist) && (
                  <Link to={createPageUrl('DriverProtocol') + `?orderId=${order.id}&type=dropoff${dropoffChecklist ? `&checklistId=${dropoffChecklist.id}` : ''}`}>
                    <Button 
                      size="sm"
                      variant={dropoffChecklist ? 'outline' : 'default'}
                      className={!dropoffChecklist ? 'bg-green-600 hover:bg-green-700' : ''}
                    >
                      {dropoffChecklist ? (
                        <>Anzeigen</>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Starten
                        </>
                      )}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}