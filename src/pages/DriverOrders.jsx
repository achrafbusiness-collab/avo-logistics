import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StatusBadge from '@/components/ui/StatusBadge';
import { useI18n } from '@/i18n';

import { 
  Truck, 
  Calendar, 
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Mail,
  Phone
} from 'lucide-react';

const MOTIVATION_KEYS = [
  'orders.motivation.safeDrive',
  'orders.motivation.newJobs',
  'orders.motivation.focus',
  'orders.motivation.smoothRide',
  'orders.motivation.strongStart',
];

const fetchDriverJokes = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return [];

  const response = await fetch('/api/driver/jokes', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    return [];
  }
  return Array.isArray(payload?.data) ? payload.data : [];
};

export default function DriverOrders() {
  const { t, formatDate } = useI18n();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [motivationIndex, setMotivationIndex] = useState(0);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
    } catch {
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
    queryFn: async () => {
      if (!currentDriver?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select([
          'id',
          'order_number',
          'status',
          'license_plate',
          'customer_order_number',
          'vehicle_brand',
          'vehicle_model',
          'vehicle_color',
          'pickup_address',
          'pickup_city',
          'dropoff_address',
          'dropoff_city',
          'distance_km',
          'pickup_date',
          'pickup_time',
        ].join(','))
        .eq('assigned_driver_id', currentDriver.id)
        .order('created_date', { ascending: false });
      if (error) {
        console.error('Supabase driver orders error:', error.message);
        return [];
      }
      return data || [];
    },
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
  const { data: jokePosts = [] } = useQuery({
    queryKey: ['driver-jokes'],
    queryFn: fetchDriverJokes,
    enabled: !!user,
    staleTime: 15000,
  });

  const appSettings = appSettingsList[0] || null;

  const activeStatuses = [
    'assigned',
    'accepted',
    'pickup_started',
    'in_transit',
    'shuttle',
    'zwischenabgabe',
    'delivery_started',
  ];
  const completedStatuses = ['completed', 'review', 'ready_for_billing', 'approved', 'cancelled'];
  const activeOrders = allOrders.filter((order) => activeStatuses.includes(order.status));
  const completedOrders = allOrders.filter((order) => completedStatuses.includes(order.status));

  const getOrderChecklists = (orderId) => checklists.filter(c => c.order_id === orderId);
  const driverDisplayName = useMemo(() => {
    if (!currentDriver) return t('orders.driverFallback');
    const fullName = [currentDriver.first_name, currentDriver.last_name].filter(Boolean).join(' ').trim();
    return fullName || currentDriver.first_name || currentDriver.last_name || t('orders.driverFallback');
  }, [currentDriver, t]);

  const activeOrdersSummary =
    activeOrders.length === 0
      ? t('orders.summary.none')
      : activeOrders.length === 1
        ? t('orders.summary.single')
        : t('orders.summary.multiple', { count: activeOrders.length });
  const rotationMessages = useMemo(() => {
    const community = (jokePosts || [])
      .map((entry) => ({
        id: `community-${entry.id}`,
        text: String(entry.text || '').trim(),
        type: 'community',
        authorName: entry.author_name || t('orders.driverFallback'),
      }))
      .filter((entry) => entry.text.length > 0);
    const defaults = MOTIVATION_KEYS.map((key) => ({
      id: key,
      text: t(key),
      type: 'default',
      authorName: '',
    }));
    return [...community, ...defaults];
  }, [jokePosts, t]);
  const currentMessage = rotationMessages[motivationIndex] || rotationMessages[0] || null;

  useEffect(() => {
    if (!rotationMessages.length) {
      setMotivationIndex(0);
      return undefined;
    }
    setMotivationIndex(Math.floor(Math.random() * rotationMessages.length));
    const interval = window.setInterval(() => {
      setMotivationIndex((prev) => (prev + 1) % rotationMessages.length);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [rotationMessages.length]);

  const OrderCard = ({ order }) => {
    const orderChecklists = getOrderChecklists(order.id);
    const hasPickup = orderChecklists.some(c => c.type === 'pickup');
    const hasDropoff = orderChecklists.some(c => c.type === 'dropoff');
    const showDistance = order.distance_km !== null && order.distance_km !== undefined;

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
                  <StatusBadge status={order.status} size="sm" label={t(`status.${order.status}`)} />
                </div>
                <p className="text-sm text-gray-500">{order.license_plate}</p>
                {order.customer_order_number && (
                  <p className="text-xs text-gray-500">
                    {t('orders.customerOrderNumber')}:{" "}
                    <span className="font-medium text-gray-700">{order.customer_order_number}</span>
                  </p>
                )}
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 rtl-flip" />
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
                  <p className="text-sm font-medium">{order.pickup_city || t('orders.pickup')}</p>
                  <p className="text-xs text-gray-500 truncate">{order.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-green-600">B</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{order.dropoff_city || t('orders.dropoff')}</p>
                  <p className="text-xs text-gray-500 truncate">{order.dropoff_address}</p>
                </div>
              </div>
            </div>

            {showDistance && (
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                {showDistance && (
                  <span>
                    {t('orders.distance')}: <strong>{order.distance_km} km</strong>
                  </span>
                )}
              </div>
            )}

            {/* Date/Time */}
            {order.pickup_date && (
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(order.pickup_date)}
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
                {t('orders.pickup')}
              </div>
              <div className={`flex-1 p-2 rounded-lg text-center text-sm ${hasDropoff ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${hasDropoff ? 'text-green-600' : 'text-gray-400'}`} />
                {t('orders.dropoff')}
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
        <h2 className="text-xl font-bold mb-2">{t('orders.noDriverProfile.title')}</h2>
        <p className="text-gray-500">{t('orders.noDriverProfile.body')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2e4a] via-[#0f4874] to-[#1f7ea4] p-6 text-white shadow-xl min-h-[44vh] md:min-h-[34vh]">
        <div className="absolute inset-0 opacity-75">
          <div className="absolute -left-24 -top-16 h-72 w-[150%] rounded-[48%] bg-cyan-200/25 blur-3xl animate-[spin_22s_linear_infinite]" />
          <div className="absolute -right-24 -bottom-24 h-80 w-[155%] rounded-[45%] bg-sky-100/20 blur-3xl animate-[spin_30s_linear_infinite_reverse]" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/10 to-transparent" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_36%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_34%)]" />
        <div className="relative z-10 flex h-full flex-col justify-between gap-8">
          <div className="flex items-center justify-between">
            <img
              src="/logo.png"
              alt="AVO"
              className="h-16 w-auto rounded-xl bg-white/95 p-2 shadow-lg md:h-20"
            />
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">
              {t('orders.welcomeBadge')}
            </span>
          </div>

          <div className="max-w-xl space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-white/75">{t('orders.greetingSimple')}</p>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">{driverDisplayName}</h1>
            <p className="text-base font-medium text-white/90 transition-opacity duration-500">
              {currentMessage?.text || t('orders.motivation.safeDrive')}
            </p>
            {currentMessage?.type === 'community' && (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                {t('orders.communityBy', { name: currentMessage.authorName })}
              </p>
            )}
          </div>

          <div className="inline-flex w-fit items-center rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold">
            {activeOrdersSummary}
          </div>
        </div>
      </div>

      <div className="px-1">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{t('orders.activeSectionHint')}</p>
        <h2 className="text-lg font-bold text-slate-900">{t('orders.activeSectionTitle')}</h2>
      </div>

      {appSettings && (appSettings.instructions || appSettings.support_phone || appSettings.support_email || appSettings.emergency_phone) && (
        <Card>
          <CardContent className="p-4 space-y-3 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-gray-900">
                {t('orders.driverHints', { company: appSettings.company_name || t('app.name') })}
              </p>
              {appSettings.instructions && (
                <p className="mt-1 whitespace-pre-wrap">{appSettings.instructions}</p>
              )}
            </div>
            <div className="grid gap-2">
              {appSettings.support_phone && (
                <a href={`tel:${appSettings.support_phone}`} className="inline-flex items-center gap-2 text-blue-600">
                  <Phone className="w-4 h-4" />
                  {t('orders.supportLabel', { phone: appSettings.support_phone })}
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
                  {t('orders.emergencyLabel', { phone: appSettings.emergency_phone })}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">
            {t('orders.tabs.active')} ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1">
            {t('orders.tabs.completed')} ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            {t('orders.tabs.all')} ({allOrders.length})
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
                <p className="text-gray-500">{t('orders.empty.active')}</p>
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
                <p className="text-gray-500">{t('orders.empty.completed')}</p>
              </CardContent>
            </Card>
          ) : (
            completedOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-4">
          {allOrders.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">{t('orders.empty.all')}</p>
              </CardContent>
            </Card>
          ) : (
            allOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
