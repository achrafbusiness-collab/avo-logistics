import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
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
  useRealtimeSync('orders', ['driver-orders']);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [motivationIndex, setMotivationIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(true);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
    } catch {
      // Not logged in
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
        throw new Error(error.message);
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
      setMessageVisible(true);
      return undefined;
    }

    const getRandomIndex = (max, exclude = -1) => {
      if (max <= 1) return 0;
      let next = Math.floor(Math.random() * max);
      while (next === exclude) {
        next = Math.floor(Math.random() * max);
      }
      return next;
    };

    setMotivationIndex(Math.floor(Math.random() * rotationMessages.length));
    setMessageVisible(true);
    const interval = window.setInterval(() => {
      setMessageVisible(false);
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = window.setTimeout(() => {
        setMotivationIndex((prev) => getRandomIndex(rotationMessages.length, prev));
        setMessageVisible(true);
      }, 320);
    }, 5000);
    return () => {
      window.clearInterval(interval);
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
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
        <Card className="hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 border border-slate-200/80 rounded-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-slate-800">{order.order_number}</span>
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

            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Truck className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
                <p className="text-sm text-gray-500">{order.vehicle_color}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-start gap-2">
                <div className="relative flex-shrink-0">
                  <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">A</span>
                  </div>
                  <div className="absolute left-[13px] top-7 bottom-0 w-px border-l border-dashed border-slate-300 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{order.pickup_city || t('orders.pickup')}</p>
                  <p className="text-xs text-gray-500 truncate">{order.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-green-600">B</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{order.dropoff_city || t('orders.dropoff')}</p>
                  <p className="text-xs text-gray-500 truncate">{order.dropoff_address}</p>
                </div>
              </div>
            </div>

            {showDistance && (
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="bg-slate-100 rounded-full px-3 py-1 text-xs font-medium text-slate-600">
                  {t('orders.distance')}: {order.distance_km} km
                </span>
              </div>
            )}

            {/* Date/Time */}
            {order.pickup_date && (
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs font-medium text-slate-600">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(order.pickup_date)}
                </span>
                {order.pickup_time && (
                  <span className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs font-medium text-slate-600">
                    <Clock className="w-3.5 h-3.5" />
                    {order.pickup_time}
                  </span>
                )}
              </div>
            )}

            {/* Progress */}
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <div className={`flex-1 p-2.5 rounded-xl text-center text-sm font-medium ${hasPickup ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${hasPickup ? 'text-emerald-500' : 'text-slate-300'}`} />
                {t('orders.pickup')}
              </div>
              <div className={`flex-1 p-2.5 rounded-xl text-center text-sm font-medium ${hasDropoff ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${hasDropoff ? 'text-emerald-500' : 'text-slate-300'}`} />
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
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Truck className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t('orders.noDriverProfile.title')}</h2>
        <p className="text-gray-500">{t('orders.noDriverProfile.body')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0a1628] via-[#0c2e4a] to-[#134e6f] p-6 text-white shadow-xl min-h-[44vh] md:min-h-[34vh]">
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
              alt="TransferFleet"
              className="h-16 w-auto drop-shadow-lg md:h-20"
            />
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">
              {t('orders.welcomeBadge')}
            </span>
          </div>

          <div className="max-w-xl space-y-2">
            <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/80 font-medium">{t('orders.greetingSimple')}</p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">{driverDisplayName}</h1>
            <div className="mt-1 flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mt-2 flex-shrink-0" />
              <div
                className={`min-h-[56px] transition-all duration-300 ${
                  messageVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                }`}
              >
                <p className="text-base font-medium text-white/95">
                  {currentMessage?.text || t('orders.motivation.safeDrive')}
                </p>
                {currentMessage?.type === 'community' && (
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    {t('orders.communityBy', { name: currentMessage.authorName })}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="inline-flex w-fit items-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5 text-sm font-medium">
            {activeOrdersSummary}
          </div>
        </div>
      </div>

      <div className="px-1">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{t('orders.activeSectionHint')}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-500 to-blue-500" />
          <h2 className="text-lg font-bold text-slate-800">{t('orders.activeSectionTitle')}</h2>
        </div>
      </div>

      {appSettings && (appSettings.instructions || appSettings.support_phone || appSettings.support_email || appSettings.emergency_phone) && (
        <Card className="border-l-4 border-l-cyan-500 bg-gradient-to-r from-cyan-50/50 to-transparent">
          <CardContent className="p-4 space-y-3 text-sm text-gray-600">
            <div>
              <p className="font-bold text-slate-800">
                {t('orders.driverHints', { company: appSettings.company_name || t('app.name') })}
              </p>
              {appSettings.instructions && (
                <p className="mt-1 whitespace-pre-wrap">{appSettings.instructions}</p>
              )}
            </div>
            <div className="grid gap-1">
              {appSettings.support_phone && (
                <a href={`tel:${appSettings.support_phone}`} className="inline-flex items-center gap-2 text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                  <Phone className="w-4 h-4" />
                  {t('orders.supportLabel', { phone: appSettings.support_phone })}
                </a>
              )}
              {appSettings.support_email && (
                <a href={`mailto:${appSettings.support_email}`} className="inline-flex items-center gap-2 text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                  <Mail className="w-4 h-4" />
                  {appSettings.support_email}
                </a>
              )}
              {appSettings.emergency_phone && (
                <a href={`tel:${appSettings.emergency_phone}`} className="inline-flex items-center gap-2 text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                  <Phone className="w-4 h-4" />
                  {t('orders.emergencyLabel', { phone: appSettings.emergency_phone })}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full bg-slate-100 rounded-xl p-1">
          <TabsTrigger value="active" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 font-medium text-sm">
            {t('orders.tabs.active')} ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 font-medium text-sm">
            {t('orders.tabs.completed')} ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 font-medium text-sm">
            {t('orders.tabs.all')} ({allOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : activeOrders.length === 0 ? (
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Truck className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-gray-500">{t('orders.empty.active')}</p>
            </div>
          ) : (
            activeOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 mt-4">
          {completedOrders.length === 0 ? (
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-gray-500">{t('orders.empty.completed')}</p>
            </div>
          ) : (
            completedOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-4">
          {allOrders.length === 0 ? (
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Truck className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-gray-500">{t('orders.empty.all')}</p>
            </div>
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
