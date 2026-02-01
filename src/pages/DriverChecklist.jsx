import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from '@/components/ui/StatusBadge';
import { useI18n } from '@/i18n';
import { getMapboxDistanceKmFromAddresses, reverseGeocode } from '@/utils/mapboxDistance';
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
  Loader2,
  LocateFixed,
  Plus,
  X
} from 'lucide-react';

const EXPENSE_TYPES = [
  { value: 'fuel', labelKey: 'protocol.expenses.types.fuel' },
  { value: 'ticket', labelKey: 'protocol.expenses.types.ticket' },
  { value: 'taxi', labelKey: 'protocol.expenses.types.taxi' },
  { value: 'toll', labelKey: 'protocol.expenses.types.toll' },
  { value: 'additional_protocol', labelKey: 'protocol.expenses.types.additional_protocol' },
];

export default function DriverChecklist() {
  const { t, formatDate, formatDateTime, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const postExpensesRef = useRef(null);
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  const [user, setUser] = useState(null);
  const [currentDriver, setCurrentDriver] = useState(null);
  const [handoffDialogOpen, setHandoffDialogOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState('handoff');
  const [handoffForm, setHandoffForm] = useState({ location: '', notes: '' });
  const [handoffCoords, setHandoffCoords] = useState(null);
  const [handoffError, setHandoffError] = useState('');
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [handoffExpensePromptOpen, setHandoffExpensePromptOpen] = useState(false);
  const [postExpenses, setPostExpenses] = useState([]);
  const [postExpenseUploads, setPostExpenseUploads] = useState({});
  const [postExpenseSaving, setPostExpenseSaving] = useState(false);
  const [postExpenseError, setPostExpenseError] = useState('');
  const [postExpenseSaved, setPostExpenseSaved] = useState(false);

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

  const { data: orderDocuments = [], isLoading: docsLoading } = useQuery({
    queryKey: ['order-documents', orderId],
    queryFn: () => appClient.entities.OrderDocument.filter({ order_id: orderId }, '-created_date', 200),
    enabled: !!orderId,
  });

  const { data: handoffs = [], isLoading: handoffsLoading } = useQuery({
    queryKey: ['order-handoffs', orderId],
    queryFn: () => appClient.entities.OrderHandoff.filter({ order_id: orderId }, '-created_date'),
    enabled: !!orderId,
  });

  const { data: orderSegments = [] } = useQuery({
    queryKey: ['order-segments', orderId],
    queryFn: () => appClient.entities.OrderSegment.filter({ order_id: orderId }, '-created_date'),
    enabled: !!orderId,
  });

  const pickupChecklist = checklists.find(c => c.type === 'pickup');
  const dropoffChecklist = checklists.find(c => c.type === 'dropoff');
  const editableChecklist = dropoffChecklist || pickupChecklist;

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });

  const acceptHandoffMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.OrderHandoff.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-handoffs', orderId] });
    },
  });

  const isLoading = orderLoading || checklistsLoading || docsLoading || handoffsLoading;
  const formatCurrency = (value) =>
    formatNumber(value ?? 0, { style: 'currency', currency: 'EUR' });

  const orderedHandoffs = [...(handoffs || [])].sort((a, b) => {
    const aDate = new Date(a.created_date || a.created_at || 0).getTime();
    const bDate = new Date(b.created_date || b.created_at || 0).getTime();
    return bDate - aDate;
  });
  const latestHandoff = orderedHandoffs[0];
  const latestAcceptedHandoff = orderedHandoffs.find((handoff) => handoff.status === 'accepted');
  const latestSegment = (orderSegments || [])[0];
  const shuttleSegments = (orderSegments || [])
    .filter(
      (segment) =>
        segment.segment_type === 'shuttle' &&
        (!currentDriver || segment.driver_id === currentDriver.id)
    )
    .sort((a, b) => {
      const aDate = new Date(a.created_date || a.created_at || 0).getTime();
      const bDate = new Date(b.created_date || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  const latestShuttleSegment = shuttleSegments[0];
  const pendingHandoff = orderedHandoffs.find((handoff) => handoff.status === 'pending');
  const pendingHandoffByCurrentDriver = Boolean(
    pendingHandoff && currentDriver && pendingHandoff.created_by_driver_id === currentDriver.id
  );
  const canCreateHandoff = Boolean(
    currentDriver && pickupChecklist && !dropoffChecklist && !pendingHandoff
  );
  const canAcceptHandoff = Boolean(
    currentDriver &&
      pendingHandoff &&
      pendingHandoff.created_by_driver_id !== currentDriver.id
  );
  const mustAcceptHandoff = Boolean(
    pendingHandoff && pendingHandoff.created_by_driver_id !== currentDriver?.id
  );
  const canShowPostExpenses = Boolean(
    pickupChecklist && (dropoffChecklist || orderedHandoffs.length > 0)
  );
  const postExpensesLocked = false;

  const pickupLocation = [order?.pickup_address, order?.pickup_postal_code, order?.pickup_city]
    .filter(Boolean)
    .join(', ');

  const getSegmentStart = () => {
    if (latestSegment?.end_location) return latestSegment.end_location;
    if (latestAcceptedHandoff?.location) return latestAcceptedHandoff.location;
    return pickupLocation || '';
  };

  const handleUseGps = async () => {
    if (!navigator.geolocation) {
      setHandoffError(t('handoff.errors.noGps'));
      return;
    }
    setGpsLoading(true);
    setHandoffError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const address = await reverseGeocode({ latitude, longitude });
          setHandoffForm((prev) => ({ ...prev, location: address || `${latitude}, ${longitude}` }));
          setHandoffCoords({ latitude, longitude });
        } catch (error) {
          setHandoffError(t('handoff.errors.reverseGeocode'));
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setHandoffError(t('handoff.errors.gpsFailed'));
        setGpsLoading(false);
      }
    );
  };

  useEffect(() => {
    if (editableChecklist?.id) {
      setPostExpenses(editableChecklist.expenses || []);
    }
  }, [editableChecklist?.id]);

  const isImageFile = (expense) => {
    const name = expense?.file_name || '';
    const type = expense?.file_type || '';
    return type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name);
  };

  const addPostExpense = () => {
    setPostExpenses((prev) => [
      ...prev,
      { type: 'fuel', amount: '', note: '', file_url: '', file_name: '', file_type: '' },
    ]);
  };

  const updatePostExpense = (index, field, value) => {
    setPostExpenses((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setPostExpenseSaved(false);
  };

  const removePostExpense = (index) => {
    setPostExpenses((prev) => prev.filter((_, i) => i !== index));
    setPostExpenseUploads((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setPostExpenseSaved(false);
  };

  const uploadPostExpenseFile = async (index, file) => {
    if (!file) return;
    setPostExpenseUploads((prev) => ({ ...prev, [index]: true }));
    setPostExpenseError('');
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      setPostExpenses((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          file_url,
          file_name: file.name,
          file_type: file.type,
        };
        return next;
      });
      setPostExpenseSaved(false);
    } catch (error) {
      setPostExpenseError(t('checklist.expenses.uploadError'));
    } finally {
      setPostExpenseUploads((prev) => ({ ...prev, [index]: false }));
    }
  };

  const savePostExpenses = async () => {
    if (!editableChecklist?.id) return;
    if (postExpensesLocked) {
      setPostExpenseError(t('checklist.expenses.locked'));
      return;
    }
    setPostExpenseSaving(true);
    setPostExpenseError('');
    try {
      await appClient.entities.Checklist.update(editableChecklist.id, {
        expenses: postExpenses,
      });
      setPostExpenseSaved(true);
      queryClient.invalidateQueries({ queryKey: ['order-checklists', orderId] });
    } catch (error) {
      setPostExpenseError(error?.message || t('checklist.expenses.saveError'));
    } finally {
      setPostExpenseSaving(false);
    }
  };

  const handleOpenPostExpenses = () => {
    setHandoffExpensePromptOpen(false);
    setTimeout(() => {
      postExpensesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const submitHandoff = async () => {
    if (!handoffForm.location.trim()) {
      setHandoffError(t('handoff.errors.locationRequired'));
      return;
    }
    setHandoffSaving(true);
    setHandoffError('');
    const isShuttle = handoffMode === 'shuttle';
    try {
      const startLocation = getSegmentStart();
      let distanceKm = null;
      if (startLocation) {
        try {
          distanceKm = await getMapboxDistanceKmFromAddresses({
            from: startLocation,
            to: handoffForm.location.trim(),
          });
        } catch (error) {
          distanceKm = null;
        }
      }

      const createdHandoff = isShuttle
        ? null
        : await appClient.entities.OrderHandoff.create({
            order_id: orderId,
            company_id: order.company_id,
            created_by_driver_id: currentDriver?.id,
            created_by_driver_name: currentDriver?.name,
            location: handoffForm.location.trim(),
            location_lat: handoffCoords?.latitude ?? null,
            location_lng: handoffCoords?.longitude ?? null,
            notes: handoffForm.notes?.trim() || null,
            status: 'pending',
          });

      await appClient.entities.OrderSegment.create({
        order_id: orderId,
        company_id: order.company_id,
        handoff_id: createdHandoff?.id ?? null,
        driver_id: currentDriver?.id,
        driver_name: currentDriver?.name,
        segment_type: isShuttle ? 'shuttle' : 'handoff',
        start_location: startLocation || null,
        end_location: handoffForm.location.trim(),
        distance_km: distanceKm,
        price: null,
      });

      if (!isShuttle) {
        await updateOrderMutation.mutateAsync({
          id: orderId,
          data: {
            assigned_driver_id: null,
            assigned_driver_name: '',
          },
        });
        queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }

      setHandoffDialogOpen(false);
      setHandoffForm({ location: '', notes: '' });
      setHandoffCoords(null);
      setHandoffExpensePromptOpen(true);
      queryClient.invalidateQueries({ queryKey: ['order-handoffs', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order-segments', orderId] });
      if (!isShuttle) {
        navigate(createPageUrl('DriverOrders'));
      }
    } catch (error) {
      setHandoffError(error?.message || t('handoff.errors.saveFailed'));
    } finally {
      setHandoffSaving(false);
    }
  };

  const handleContinueFromHandoff = async () => {
    if (!pendingHandoff || !currentDriver) return;
    setHandoffError('');
    try {
      await acceptHandoffMutation.mutateAsync({
        id: pendingHandoff.id,
        data: {
          status: 'accepted',
          accepted_by_driver_id: currentDriver.id,
          accepted_by_driver_name: currentDriver.name,
          accepted_at: new Date().toISOString(),
        },
      });
      await updateOrderMutation.mutateAsync({
        id: orderId,
        data: {
          assigned_driver_id: currentDriver.id,
          assigned_driver_name: currentDriver.name,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    } catch (error) {
      setHandoffError(error?.message || t('handoff.errors.acceptFailed'));
    }
  };

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
            <ArrowLeft className="w-4 h-4 mr-2 rtl-flip" />
            {t('common.back')}
          </Button>
        </Link>
        <Card>
          <CardContent className="text-center py-12">
            <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">{t('checklist.orderNotFound')}</p>
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
          <ArrowLeft className="w-4 h-4 mr-2 rtl-flip" />
          {t('checklist.backToOrders')}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <p className="text-white/70">{order.license_plate}</p>
            {order.customer_order_number && (
              <p className="text-white/70 text-sm">
                {t('orders.customerOrderNumber')}:{" "}
                <span className="font-semibold text-white">{order.customer_order_number}</span>
              </p>
            )}
          </div>
          <StatusBadge status={order.status} label={t(`status.${order.status}`)} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Vehicle Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4" />
              {t('checklist.vehicle.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">{t('checklist.vehicle.brandModel')}</p>
                <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
              </div>
              <div>
                <p className="text-gray-500">{t('checklist.vehicle.color')}</p>
                <p className="font-medium">{order.vehicle_color || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">{t('checklist.vehicle.vin')}</p>
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
              {t('checklist.route.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pickup */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">A</span>
                </div>
                <span className="font-semibold text-blue-900">{t('orders.pickup')}</span>
              </div>
              <p className="font-medium">{order.pickup_address}</p>
              <p className="text-sm text-gray-600">{order.pickup_city}</p>
              {pickupChecklist?.location_confirmed === false && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                  <p className="font-semibold">{t('checklist.route.deviationPickup')}</p>
                  <p>{pickupChecklist.location || '-'}</p>
                  {pickupChecklist.location_reason && (
                    <p className="mt-1 text-xs text-amber-800">
                      {t('checklist.route.deviationReason')}: {pickupChecklist.location_reason}
                    </p>
                  )}
                </div>
              )}
              {order.pickup_date && (
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
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
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(order.pickup_address + ' ' + order.pickup_city)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-blue-600 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                {t('checklist.route.openMaps')}
              </a>
            </div>

            {/* Dropoff */}
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">B</span>
                </div>
                <span className="font-semibold text-green-900">{t('orders.dropoff')}</span>
              </div>
              <p className="font-medium">{order.dropoff_address}</p>
              <p className="text-sm text-gray-600">{order.dropoff_city}</p>
              {dropoffChecklist?.location_confirmed === false && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                  <p className="font-semibold">{t('checklist.route.deviationDropoff')}</p>
                  <p>{dropoffChecklist.location || '-'}</p>
                  {dropoffChecklist.location_reason && (
                    <p className="mt-1 text-xs text-amber-800">
                      {t('checklist.route.deviationReason')}: {dropoffChecklist.location_reason}
                    </p>
                  )}
                </div>
              )}
              {order.dropoff_date && (
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(order.dropoff_date)}
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
                {t('checklist.route.openMaps')}
              </a>
            </div>

            {order.distance_km !== null && order.distance_km !== undefined && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <div className="flex flex-wrap gap-4">
                  <span>
                    {t('orders.distance')}: <strong>{order.distance_km} km</strong>
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(pendingHandoff || canCreateHandoff) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t('handoff.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingHandoff ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-semibold">
                    {pendingHandoffByCurrentDriver
                      ? t('handoff.successTitle')
                      : t('handoff.pendingTitle')}
                  </p>
                  <p className="text-emerald-800">{pendingHandoff.location}</p>
                  {pendingHandoff.notes && (
                    <p className="text-xs text-emerald-700 mt-2">{pendingHandoff.notes}</p>
                  )}
                  <div className="flex flex-col gap-2 mt-3">
                    {(canAcceptHandoff || pendingHandoffByCurrentDriver) && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={handleContinueFromHandoff}
                      >
                        {t('handoff.continue')}
                      </Button>
                    )}
                    <span className="text-xs text-emerald-700">
                      {pendingHandoffByCurrentDriver
                        ? t('handoff.pendingByYou')
                        : t('handoff.acceptRequired')}
                    </span>
                  </div>
                </div>
              ) : latestHandoff ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-semibold">{t('handoff.acceptedTitle')}</p>
                  <p className="text-emerald-800">{latestHandoff.location}</p>
                  <div className="mt-2 space-y-1 text-xs text-emerald-700">
                    {latestHandoff.created_by_driver_name && (
                      <p>{t('handoff.createdBy', { name: latestHandoff.created_by_driver_name })}</p>
                    )}
                    {latestHandoff.accepted_by_driver_name && (
                      <p>{t('handoff.acceptedBy', { name: latestHandoff.accepted_by_driver_name })}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t('handoff.none')}</p>
              )}

              {latestShuttleSegment && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">{t('handoff.shuttleConfirmedTitle')}</p>
                  <p className="text-blue-800">{latestShuttleSegment.end_location}</p>
                </div>
              )}

              {shuttleSegments.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold">{t('handoff.shuttleStopsTitle')}</p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {shuttleSegments.map((segment, index) => (
                      <div key={segment.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{index + 1}.</span>
                        <span>{segment.end_location}</span>
                        {(segment.created_date || segment.created_at) && (
                          <span className="text-slate-400">
                            • {formatDateTime(segment.created_date || segment.created_at)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canCreateHandoff && (
                <div className="grid gap-2">
                  <Button
                    type="button"
                    className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                    onClick={() => {
                      setHandoffMode('handoff');
                      setHandoffDialogOpen(true);
                    }}
                  >
                    {t('handoff.create')}
                  </Button>
                  <Button
                    type="button"
                    className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                    onClick={() => {
                      setHandoffMode('shuttle');
                      setHandoffDialogOpen(true);
                    }}
                  >
                    {t('handoff.shuttleCreate')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canShowPostExpenses && (
          <Card ref={postExpensesRef}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                {t('checklist.expenses.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">{t('checklist.expenses.subtitle')}</p>

              {postExpenses.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  {t('checklist.expenses.empty')}
                </div>
              )}

              <div className="space-y-4">
                {postExpenses.map((expense, index) => (
                  <div key={`post-expense-${index}`} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {t('checklist.expenses.itemTitle', { index: index + 1 })}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePostExpense(index)}
                        disabled={postExpensesLocked || Boolean(expense.file_url)}
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <Label>{t('checklist.expenses.type')}</Label>
                        <Select
                          value={expense.type || 'fuel'}
                          onValueChange={(value) => updatePostExpense(index, 'type', value)}
                          disabled={postExpensesLocked}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_TYPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('checklist.expenses.amount')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={expense.amount || ''}
                          onChange={(event) => updatePostExpense(index, 'amount', event.target.value)}
                          placeholder="0.00"
                          disabled={postExpensesLocked}
                        />
                      </div>
                      <div>
                        <Label>{t('checklist.expenses.note')}</Label>
                        <Input
                          value={expense.note || ''}
                          onChange={(event) => updatePostExpense(index, 'note', event.target.value)}
                          placeholder={t('checklist.expenses.notePlaceholder')}
                          disabled={postExpensesLocked}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label>{t('checklist.expenses.receipt')}</Label>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById(`post-expense-file-${index}`)?.click()}
                          disabled={postExpenseUploads[index] || postExpensesLocked}
                        >
                          {postExpenseUploads[index]
                            ? t('checklist.expenses.uploading')
                            : t('checklist.expenses.upload')}
                        </Button>
                        {expense.file_url && isImageFile(expense) && (
                          <img
                            src={expense.file_url}
                            alt={expense.file_name || t('checklist.expenses.receipt')}
                            className="h-16 w-20 rounded border object-cover"
                          />
                        )}
                        {expense.file_url && !isImageFile(expense) && (
                          <a
                            href={expense.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-blue-600 underline"
                          >
                            {expense.file_name || t('checklist.expenses.view')}
                          </a>
                        )}
                      </div>
                      <input
                        id={`post-expense-file-${index}`}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            uploadPostExpenseFile(index, file);
                          }
                          event.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={addPostExpense}
                disabled={postExpensesLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('checklist.expenses.add')}
              </Button>

              {postExpenseError && <p className="text-sm text-red-600">{postExpenseError}</p>}
              {postExpensesLocked && (
                <p className="text-sm text-slate-500">{t('checklist.expenses.locked')}</p>
              )}
              {postExpenseSaved && (
                <p className="text-sm text-emerald-600">{t('checklist.expenses.saved')}</p>
              )}

              <Button
                className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                onClick={savePostExpenses}
                disabled={postExpenseSaving || postExpensesLocked}
              >
                {postExpenseSaving ? t('checklist.expenses.saving') : t('checklist.expenses.save')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Documents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('checklist.documents.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {docsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : orderDocuments.length === 0 ? (
              <p className="text-sm text-gray-500">{t('checklist.documents.empty')}</p>
            ) : (
              <div className="space-y-2">
                {orderDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div>
                      <p className="font-medium text-slate-900">{doc.title || doc.file_name}</p>
                      <p className="text-xs text-slate-500">{doc.file_name}</p>
                      {doc.category && (
                        <p className="text-xs text-slate-500">{doc.category}</p>
                      )}
                    </div>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">
                          {t('checklist.documents.open')}
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer */}
        {order.customer_name && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('checklist.customer.title')}</CardTitle>
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
              <CardTitle className="text-base">{t('checklist.notes.title')}</CardTitle>
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
              {t('checklist.protocols.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canShowPostExpenses && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleOpenPostExpenses}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                {t('checklist.expenses.open')}
              </Button>
            )}
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
                    <p className="font-semibold">{t('checklist.protocols.pickupTitle')}</p>
                    {pickupChecklist ? (
                      <p className="text-sm text-green-700">
                        {t('checklist.protocols.createdAt', { date: formatDateTime(pickupChecklist.datetime) })}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">{t('checklist.protocols.notCreated')}</p>
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
                      <>{t('checklist.protocols.view')}</>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        {t('checklist.protocols.start')}
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
                    <p className="font-semibold">{t('checklist.protocols.dropoffTitle')}</p>
                    {dropoffChecklist ? (
                      <p className="text-sm text-green-700">
                        {t('checklist.protocols.createdAt', { date: formatDateTime(dropoffChecklist.datetime) })}
                      </p>
                    ) : pickupChecklist ? (
                      <p className="text-sm text-gray-500">{t('checklist.protocols.ready')}</p>
                    ) : (
                      <p className="text-sm text-gray-400">{t('checklist.protocols.createPickupFirst')}</p>
                    )}
                  </div>
                </div>
                {(pickupChecklist || dropoffChecklist) && (
                  mustAcceptHandoff && !dropoffChecklist ? (
                    <Button size="sm" variant="outline" disabled>
                      {t('handoff.acceptRequired')}
                    </Button>
                  ) : (
                    <Link to={createPageUrl('DriverProtocol') + `?orderId=${order.id}&type=dropoff${dropoffChecklist ? `&checklistId=${dropoffChecklist.id}` : ''}`}>
                      <Button
                        size="sm"
                        variant={dropoffChecklist ? 'outline' : 'default'}
                        className={!dropoffChecklist ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {dropoffChecklist ? (
                          <>{t('checklist.protocols.view')}</>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            {t('checklist.protocols.start')}
                          </>
                        )}
                      </Button>
                    </Link>
                  )
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={handoffDialogOpen} onOpenChange={setHandoffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {handoffMode === 'shuttle'
                ? t('handoff.shuttleDialogTitle')
                : t('handoff.dialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {handoffMode === 'shuttle'
                ? t('handoff.shuttleDialogDescription')
                : t('handoff.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('handoff.locationLabel')}</Label>
              <AddressAutocomplete
                value={handoffForm.location}
                onChange={(value) => setHandoffForm((prev) => ({ ...prev, location: value }))}
                onSelect={({ address, city, postalCode }) => {
                  const full = [address, postalCode, city].filter(Boolean).join(", ");
                  setHandoffForm((prev) => ({ ...prev, location: full || address }));
                }}
                placeholder={t('handoff.locationPlaceholder')}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleUseGps}
                disabled={gpsLoading}
              >
                <LocateFixed className="w-4 h-4 mr-2" />
                {gpsLoading ? t('handoff.gpsLoading') : t('handoff.useGps')}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>{t('handoff.notesLabel')}</Label>
              <Textarea
                value={handoffForm.notes}
                onChange={(event) =>
                  setHandoffForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder={t('handoff.notesPlaceholder')}
              />
            </div>
            {handoffError && <p className="text-sm text-red-600">{handoffError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHandoffDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitHandoff} disabled={handoffSaving}>
              {handoffSaving
                ? t('common.saving')
                : handoffMode === 'shuttle'
                  ? t('handoff.shuttleSave')
                  : t('handoff.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={handoffExpensePromptOpen} onOpenChange={setHandoffExpensePromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('handoff.expensesPromptTitle')}</DialogTitle>
            <DialogDescription>{t('handoff.expensesPromptBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHandoffExpensePromptOpen(false)}>
              {t('handoff.expensesPromptLater')}
            </Button>
            <Button onClick={handleOpenPostExpenses}>
              {t('handoff.expensesPromptConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
