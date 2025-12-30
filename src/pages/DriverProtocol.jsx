import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SignaturePad from '@/components/driver/SignaturePad';
import PhotoCapture, { REQUIRED_PHOTO_IDS } from '@/components/driver/PhotoCapture';
import ProtocolWizard from '@/components/driver/ProtocolWizard';
import { useI18n } from '@/i18n';
import { 
  ArrowLeft,
  Loader2,
  Car,
  AlertTriangle,
  PenTool,
  CheckCircle2,
  Plus,
  X
} from 'lucide-react';

const DAMAGE_POINTS = [
  { id: 'front-left', labelKey: 'protocol.damagePoints.frontLeft', x: 18, y: 20 },
  { id: 'front-right', labelKey: 'protocol.damagePoints.frontRight', x: 82, y: 20 },
  { id: 'hood', labelKey: 'protocol.damagePoints.hood', x: 50, y: 18 },
  { id: 'roof', labelKey: 'protocol.damagePoints.roof', x: 50, y: 38 },
  { id: 'left-side', labelKey: 'protocol.damagePoints.leftSide', x: 20, y: 50 },
  { id: 'right-side', labelKey: 'protocol.damagePoints.rightSide', x: 80, y: 50 },
  { id: 'rear-left', labelKey: 'protocol.damagePoints.rearLeft', x: 18, y: 78 },
  { id: 'rear-right', labelKey: 'protocol.damagePoints.rearRight', x: 82, y: 78 },
  { id: 'trunk', labelKey: 'protocol.damagePoints.trunk', x: 50, y: 80 },
  { id: 'glass', labelKey: 'protocol.damagePoints.glass', x: 50, y: 55 },
];

export default function DriverProtocol() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  const type = urlParams.get('type'); // pickup or dropoff
  const checklistId = urlParams.get('checklistId');

  const [user, setUser] = useState(null);
  const [currentDriver, setCurrentDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState('vehicle_check');
  const [submitError, setSubmitError] = useState('');
  const [signatureModal, setSignatureModal] = useState(null);

  const [formData, setFormData] = useState({
    order_id: orderId,
    type: type,
    datetime: new Date().toISOString(),
    location: '',
    kilometer: '',
    fuel_level: '1/2',
    cleanliness_inside: 'normal',
    cleanliness_outside: 'normal',
    accessories: {
      spare_wheel: false,
      warning_triangle: false,
      first_aid_kit: false,
      safety_vest: false,
      car_jack: false,
      wheel_wrench: false,
      manual: false,
      service_book: false,
      registration_doc: false,
      keys_count: 1
    },
    damages: [],
    photos: [],
    notes: '',
    mandatory_checks: {},
    signature_driver: '',
    signature_customer: '',
    customer_name: '',
    completed: false
  });

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

  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orders = await appClient.entities.Order.filter({ id: orderId });
      return orders[0];
    },
    enabled: !!orderId,
  });

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });

  const appSettings = appSettingsList[0] || null;

  const { data: existingChecklist } = useQuery({
    queryKey: ['checklist', checklistId],
    queryFn: async () => {
      if (!checklistId) return null;
      const checklists = await appClient.entities.Checklist.filter({ id: checklistId });
      return checklists[0];
    },
    enabled: !!checklistId,
  });

  useEffect(() => {
    if (existingChecklist) {
      setFormData({
        ...existingChecklist,
        kilometer: existingChecklist.kilometer?.toString() || ''
      });
    }
  }, [existingChecklist]);

  useEffect(() => {
    if (!order || formData.location || existingChecklist) {
      return;
    }
    const defaultLocation =
      type === 'dropoff'
        ? [order.dropoff_address, order.dropoff_city].filter(Boolean).join(', ')
        : [order.pickup_address, order.pickup_city].filter(Boolean).join(', ');
    if (defaultLocation) {
      setFormData(prev => ({ ...prev, location: defaultLocation }));
    }
  }, [order, type, existingChecklist, formData.location]);

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Checklist.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-checklists', orderId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Checklist.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-checklists', orderId] });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
  });

  useEffect(() => {
    if (!orderId || !order?.status) return;
    let nextStatus = null;
    if (type === 'pickup' && ['new', 'assigned'].includes(order.status)) {
      nextStatus = 'pickup_started';
    }
    if (type === 'dropoff' && ['in_transit', 'pickup_started', 'assigned', 'new'].includes(order.status)) {
      nextStatus = 'delivery_started';
    }
    if (nextStatus && nextStatus !== order.status) {
      updateOrderMutation.mutate({ id: orderId, data: { status: nextStatus } });
    }
  }, [order?.status, orderId, type]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAccessoryChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      accessories: { ...prev.accessories, [field]: value }
    }));
  };

  const addDamageFromSketch = (point) => {
    if (isViewOnly) return;
    const label = t(point.labelKey);
    setFormData((prev) => {
      const existing = prev.damages?.some((damage) => damage.location === label);
      if (existing) return prev;
      const nextDamages = [
        ...(prev.damages || []),
        { location: label, description: '', severity: 'minor', type: 'K' },
      ];
      return { ...prev, damages: nextDamages };
    });
  };

  const clearDamages = () => {
    if (isViewOnly) return;
    setFormData((prev) => ({ ...prev, damages: [] }));
  };

  const addDamage = () => {
    setFormData(prev => ({
      ...prev,
      damages: [...prev.damages, { location: '', description: '', severity: 'minor' }]
    }));
  };

  const updateDamage = (index, field, value) => {
    setFormData(prev => {
      const newDamages = [...prev.damages];
      newDamages[index] = { ...newDamages[index], [field]: value };
      return { ...prev, damages: newDamages };
    });
  };

  const removeDamage = (index) => {
    setFormData(prev => ({
      ...prev,
      damages: prev.damages.filter((_, i) => i !== index)
    }));
  };

  const submitProtocol = async () => {
    const missingPhotoIds = REQUIRED_PHOTO_IDS.filter((id) => !formData.photos?.some((photo) => photo.type === id));
    if (!formData.kilometer) {
      setSubmitError(t('protocol.errors.missingKilometer'));
      setCurrentStep('vehicle_check');
      return;
    }
    if (missingPhotoIds.length > 0) {
      setSubmitError(t('protocol.errors.missingPhotos'));
      setCurrentStep('photos');
      return;
    }
    const damageHasGaps = formData.damages?.some(
      (damage) => !damage.location || !damage.description
    );
    if (damageHasGaps) {
      setSubmitError(t('protocol.errors.damageIncomplete'));
      setCurrentStep('photos');
      return;
    }
    if (!formData.signature_driver) {
      setSubmitError(t('protocol.errors.missingDriverSignature'));
      setCurrentStep('signatures');
      return;
    }
    if (!formData.signature_customer) {
      setSubmitError(t('protocol.errors.missingCustomerSignature'));
      setCurrentStep('signatures');
      return;
    }
    if (!formData.customer_name) {
      setSubmitError(t('protocol.errors.missingCustomerName'));
      setCurrentStep('signatures');
      return;
    }

    setSubmitError('');
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        order_id: orderId,
        order_number: order?.order_number,
        driver_id: currentDriver?.id,
        driver_name: currentDriver?.name,
        kilometer: formData.kilometer ? parseFloat(formData.kilometer) : null,
        completed: true
      };

      if (checklistId) {
        await updateMutation.mutateAsync({ id: checklistId, data: dataToSave });
      } else {
        await createMutation.mutateAsync(dataToSave);
      }

      // Update order status
      let newStatus = order?.status;
      if (type === 'pickup') {
        newStatus = 'in_transit'; // Nach Abholprotokoll → In Lieferung
      } else if (type === 'dropoff') {
        newStatus = 'completed'; // Nach Abgabeprotokoll → Erfolgreich beendet
      }
      
      if (newStatus !== order?.status) {
        await updateOrderMutation.mutateAsync({ 
          id: orderId, 
          data: { status: newStatus }
        });
      }

      // Navigate back
      window.location.href = createPageUrl('DriverChecklist') + `?orderId=${orderId}`;
    } finally {
      setSaving(false);
    }
  };

  const isViewOnly = !!checklistId && existingChecklist?.completed;
  const damageHasGaps = formData.damages?.some(
    (damage) => !damage.location || !damage.description
  );
  const hasAllRequiredPhotos = REQUIRED_PHOTO_IDS.every((id) =>
    formData.photos?.some((photo) => photo.type === id)
  );
  const damagesComplete =
    !formData.damages?.length ||
    formData.damages.every((damage) => damage.location && damage.description);
  const photosComplete = hasAllRequiredPhotos && damagesComplete;

  const getStepBlockingReason = (stepId) => {
    if (stepId === 'vehicle_check' && !formData.kilometer) {
      return t('protocol.errors.missingKilometer');
    }
    if (stepId === 'photos') {
      if (!hasAllRequiredPhotos) {
        return t('protocol.errors.missingPhotos');
      }
      if (damageHasGaps) {
        return t('protocol.errors.damageIncomplete');
      }
    }
    if (stepId === 'signatures') {
      if (!formData.customer_name || !formData.signature_driver || !formData.signature_customer) {
        return t('protocol.errors.missingSignatures');
      }
    }
    return '';
  };

  const completedSteps = isViewOnly
    ? ['vehicle_check', 'photos', 'signatures']
    : [
        formData.kilometer ? 'vehicle_check' : null,
        photosComplete ? 'photos' : null,
        formData.signature_driver && formData.signature_customer && formData.customer_name
          ? 'signatures'
          : null,
      ].filter(Boolean);

  const handleBeforeNext = (stepId) => {
    if (isViewOnly) return true;
    const reason = getStepBlockingReason(stepId);
    if (reason) {
      setSubmitError(reason);
      return false;
    }
    setSubmitError('');
    return true;
  };

  const handleSubmit = async () => {
    if (isViewOnly) return;
    await submitProtocol();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 pb-24">
      {/* Header */}
      <div className="px-4 pt-4">
        <div className="mx-auto max-w-3xl">
          <div className={`${type === 'pickup' ? 'bg-blue-600' : 'bg-green-600'} text-white px-4 py-6 rounded-3xl shadow-[0_20px_40px_-30px_rgba(15,23,42,0.7)]`}>
            <Link to={createPageUrl('DriverChecklist') + `?orderId=${orderId}`} className="inline-flex items-center text-white/80 hover:text-white mb-4">
              <ArrowLeft className="w-4 h-4 mr-2 rtl-flip" />
              {t('common.back')}
            </Link>
            <h1 className="text-2xl font-bold">
              {type === 'pickup' ? t('protocol.pickupTitle') : t('protocol.dropoffTitle')}
            </h1>
            <p className="text-white/80">{order?.order_number} • {order?.license_plate}</p>
          </div>
        </div>
      </div>

      <ProtocolWizard
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepChange={setCurrentStep}
        onBeforeNext={handleBeforeNext}
      >
        <div className="space-y-4">
          {submitError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {submitError}
            </div>
          )}
          {appSettings && appSettings.instructions && currentStep === 'vehicle_check' && (
            <Card>
              <CardContent className="p-4 text-sm text-gray-600 whitespace-pre-wrap">
                <span className="block font-semibold text-gray-900 mb-1">{t('protocol.driverNotesTitle')}</span>
                {appSettings.instructions}
              </CardContent>
            </Card>
          )}

          {currentStep === 'vehicle_check' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Car className="w-5 h-5 text-gray-600" />
                  {t('protocol.basics.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label>{t('protocol.basics.location')}</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder={t('protocol.basics.locationPlaceholder')}
                    disabled={isViewOnly}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('protocol.basics.kilometer')}</Label>
                    <Input
                      type="number"
                      value={formData.kilometer}
                      onChange={(e) => handleChange('kilometer', e.target.value)}
                      placeholder={t('protocol.basics.kilometerPlaceholder')}
                      disabled={isViewOnly}
                    />
                  </div>
                  <div>
                    <Label>{t('protocol.basics.fuel')}</Label>
                    <Select
                      value={formData.fuel_level}
                      onValueChange={(v) => handleChange('fuel_level', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empty">{t('protocol.basics.fuelOptions.empty')}</SelectItem>
                        <SelectItem value="1/4">1/4</SelectItem>
                        <SelectItem value="1/2">1/2</SelectItem>
                        <SelectItem value="3/4">3/4</SelectItem>
                        <SelectItem value="full">{t('protocol.basics.fuelOptions.full')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('protocol.basics.cleanInside')}</Label>
                    <Select
                      value={formData.cleanliness_inside}
                      onValueChange={(v) => handleChange('cleanliness_inside', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clean">{t('protocol.basics.cleanOptions.clean')}</SelectItem>
                        <SelectItem value="normal">{t('protocol.basics.cleanOptions.normal')}</SelectItem>
                        <SelectItem value="dirty">{t('protocol.basics.cleanOptions.dirty')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('protocol.basics.cleanOutside')}</Label>
                    <Select
                      value={formData.cleanliness_outside}
                      onValueChange={(v) => handleChange('cleanliness_outside', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clean">{t('protocol.basics.cleanOptions.clean')}</SelectItem>
                        <SelectItem value="normal">{t('protocol.basics.cleanOptions.normal')}</SelectItem>
                        <SelectItem value="dirty">{t('protocol.basics.cleanOptions.dirty')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  {[
                    { id: 'spare_wheel', labelKey: 'protocol.basics.accessories.spareWheel' },
                    { id: 'warning_triangle', labelKey: 'protocol.basics.accessories.warningTriangle' },
                    { id: 'first_aid_kit', labelKey: 'protocol.basics.accessories.firstAidKit' },
                    { id: 'safety_vest', labelKey: 'protocol.basics.accessories.safetyVest' },
                    { id: 'car_jack', labelKey: 'protocol.basics.accessories.carJack' },
                    { id: 'wheel_wrench', labelKey: 'protocol.basics.accessories.wheelWrench' },
                    { id: 'manual', labelKey: 'protocol.basics.accessories.manual' },
                    { id: 'service_book', labelKey: 'protocol.basics.accessories.serviceBook' },
                    { id: 'registration_doc', labelKey: 'protocol.basics.accessories.registrationDoc' },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span>{t(item.labelKey)}</span>
                      <Switch
                        checked={formData.accessories[item.id]}
                        onCheckedChange={(v) => handleAccessoryChange(item.id, v)}
                        disabled={isViewOnly}
                        className="data-[state=checked]:bg-[#1e3a5f] data-[state=unchecked]:bg-slate-200"
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <Label>{t('protocol.basics.keysCount')}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.accessories.keys_count}
                      onChange={(e) => handleAccessoryChange('keys_count', parseInt(e.target.value) || 0)}
                      disabled={isViewOnly}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 'photos' && (
            <div className="space-y-4">
              <PhotoCapture
                photos={formData.photos}
                onChange={(photos) => handleChange('photos', photos)}
                readOnly={isViewOnly}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="w-5 h-5 text-gray-600" />
                    {t('protocol.damage.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm text-slate-600 mb-2">
                      {t('protocol.damage.instructions')}
                    </p>
                    <div className="relative overflow-hidden rounded-lg border bg-white">
                      <img
                        src="/vehicle-sketch.svg"
                        alt={t('protocol.damage.sketchAlt')}
                        className="w-full"
                      />
                      {DAMAGE_POINTS.map((point) => (
                        <button
                          key={point.id}
                          type="button"
                          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600/80 shadow"
                          style={{ left: `${point.x}%`, top: `${point.y}%` }}
                          onClick={() => addDamageFromSketch(point)}
                          disabled={isViewOnly}
                          aria-label={t('protocol.damage.markAria', { location: t(point.labelKey) })}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full border border-slate-200 px-2 py-1">{t('protocol.damage.legend.scratch')}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">{t('protocol.damage.legend.chip')}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">{t('protocol.damage.legend.dent')}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">{t('protocol.damage.legend.damage')}</span>
                    </div>
                  </div>
                  {formData.damages?.map((damage, index) => (
                    <div key={index} className="p-3 border rounded-lg relative">
                      {!isViewOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute top-2 right-2 w-6 h-6 text-red-500"
                          onClick={() => removeDamage(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="space-y-3 pr-8">
                        <div>
                          <Label>{t('protocol.damage.location')}</Label>
                          <Input
                            value={damage.location}
                            onChange={(e) => updateDamage(index, 'location', e.target.value)}
                            placeholder={t('protocol.damage.locationPlaceholder')}
                            disabled={isViewOnly}
                          />
                        </div>
                        <div>
                          <Label>{t('protocol.damage.type')}</Label>
                          <Select
                            value={damage.type || 'K'}
                            onValueChange={(v) => updateDamage(index, 'type', v)}
                            disabled={isViewOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="K">{t('protocol.damage.typeOptions.scratch')}</SelectItem>
                              <SelectItem value="S">{t('protocol.damage.typeOptions.chip')}</SelectItem>
                              <SelectItem value="D">{t('protocol.damage.typeOptions.dent')}</SelectItem>
                              <SelectItem value="B">{t('protocol.damage.typeOptions.damage')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('protocol.damage.description')}</Label>
                          <Input
                            value={damage.description}
                            onChange={(e) => updateDamage(index, 'description', e.target.value)}
                            placeholder={t('protocol.damage.descriptionPlaceholder')}
                            disabled={isViewOnly}
                          />
                        </div>
                        <div>
                          <Label>{t('protocol.damage.severity')}</Label>
                          <Select
                            value={damage.severity}
                            onValueChange={(v) => updateDamage(index, 'severity', v)}
                            disabled={isViewOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minor">{t('protocol.damage.severityOptions.minor')}</SelectItem>
                              <SelectItem value="medium">{t('protocol.damage.severityOptions.medium')}</SelectItem>
                              <SelectItem value="severe">{t('protocol.damage.severityOptions.severe')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!isViewOnly && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <Button variant="outline" className="w-full" onClick={addDamage}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('protocol.damage.add')}
                      </Button>
                      <Button variant="outline" className="w-full" onClick={clearDamages}>
                        {t('protocol.damage.none')}
                      </Button>
                    </div>
                  )}
                  {formData.damages?.length === 0 && (
                    <p className="text-center text-gray-500 py-4">{t('protocol.damage.empty')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 'signatures' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PenTool className="w-5 h-5 text-gray-600" />
                  {t('protocol.signatures.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-6">
                <div>
                  <Label>{t('protocol.signatures.notes')}</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder={t('protocol.signatures.notesPlaceholder')}
                    rows={3}
                    disabled={isViewOnly}
                  />
                </div>

                <div>
                  <Label>{t('protocol.signatures.customerName')}</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => handleChange('customer_name', e.target.value)}
                    placeholder={t('protocol.signatures.customerNamePlaceholder')}
                    disabled={isViewOnly}
                  />
                </div>
                {appSettings && (appSettings.legal_text || appSettings.delivery_legal_text) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {(type === 'pickup' ? appSettings.legal_text : appSettings.delivery_legal_text) ||
                      appSettings.legal_text}
                  </div>
                )}

                {!isViewOnly ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      {
                        key: 'driver',
                        label: t('protocol.signatures.driverSignature'),
                        value: formData.signature_driver,
                        onChange: (v) => handleChange('signature_driver', v),
                      },
                      {
                        key: 'customer',
                        label: t('protocol.signatures.customerSignature'),
                        value: formData.signature_customer,
                        onChange: (v) => handleChange('signature_customer', v),
                      },
                    ].map((item) => (
                      <Card key={item.key} className="border-slate-200">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">{item.label}</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSignatureModal(item.key)}
                            >
                              {item.value ? t('protocol.signatures.edit') : t('protocol.signatures.add')}
                            </Button>
                          </div>
                          {item.value ? (
                            <img
                              src={item.value}
                              alt={item.label}
                              className="w-full rounded border bg-white object-contain max-h-40"
                            />
                          ) : (
                            <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                              {t('protocol.signatures.empty')}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {formData.signature_driver && (
                      <div>
                        <Label>{t('protocol.signatures.driverSignature')}</Label>
                        <img
                          src={formData.signature_driver}
                          alt={t('protocol.signatures.driverSignature')}
                          className="border rounded mt-2 max-h-24"
                        />
                      </div>
                    )}
                    {formData.signature_customer && (
                      <div>
                        <Label>{t('protocol.signatures.customerSignature')}</Label>
                        <img
                          src={formData.signature_customer}
                          alt={t('protocol.signatures.customerSignature')}
                          className="border rounded mt-2 max-h-24"
                        />
                      </div>
                    )}
                  </div>
                )}

                {!isViewOnly && (
                  <Button
                    className={`w-full py-5 text-lg ${type === 'pickup' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                    onClick={handleSubmit}
                    disabled={saving || !formData.kilometer}
                  >
                    {saving ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                    )}
                    {t('protocol.signatures.submit')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ProtocolWizard>

      <Dialog open={!!signatureModal} onOpenChange={(open) => !open && setSignatureModal(null)}>
        <DialogContent className="w-[95vw] max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {signatureModal === 'driver'
                ? t('protocol.signatures.driverSignature')
                : t('protocol.signatures.customerSignature')}
            </DialogTitle>
          </DialogHeader>
          {signatureModal && (
            <SignaturePad
              label={t('protocol.signatures.signatureHint')}
              value={signatureModal === 'driver' ? formData.signature_driver : formData.signature_customer}
              onChange={(v) =>
                handleChange(signatureModal === 'driver' ? 'signature_driver' : 'signature_customer', v)
              }
              height={320}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
