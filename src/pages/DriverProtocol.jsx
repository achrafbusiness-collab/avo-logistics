import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  DialogDescription,
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

const DAMAGE_LOCATIONS = [
  { id: 'odometer', labelKey: 'photos.types.odometer' },
  { id: 'door_driver', labelKey: 'photos.types.doorDriver' },
  { id: 'wheel_front_left', labelKey: 'photos.types.wheelFrontLeft' },
  { id: 'front_right', labelKey: 'photos.types.frontRight' },
  { id: 'front', labelKey: 'photos.types.front' },
  { id: 'front_left', labelKey: 'photos.types.frontLeft' },
  { id: 'wheel_front_right', labelKey: 'photos.types.wheelFrontRight' },
  { id: 'door_passenger', labelKey: 'photos.types.doorPassenger' },
  { id: 'door_rear_right', labelKey: 'photos.types.doorRearRight' },
  { id: 'wheel_rear_right', labelKey: 'photos.types.wheelRearRight' },
  { id: 'rear_right', labelKey: 'photos.types.rearRight' },
  { id: 'rear', labelKey: 'photos.types.rear' },
  { id: 'trunk', labelKey: 'photos.types.trunk' },
  { id: 'rear_left', labelKey: 'photos.types.rearLeft' },
  { id: 'wheel_rear_left', labelKey: 'photos.types.wheelRearLeft' },
  { id: 'door_rear_left', labelKey: 'photos.types.doorRearLeft' },
  { id: 'windshield', labelKey: 'photos.types.windshield' },
  { id: 'interior_front', labelKey: 'photos.types.interiorFront' },
  { id: 'interior_rear', labelKey: 'photos.types.interiorRear' },
];

const EXPENSE_TYPES = [
  { value: 'fuel', labelKey: 'protocol.expenses.types.fuel' },
  { value: 'taxi', labelKey: 'protocol.expenses.types.taxi' },
  { value: 'toll', labelKey: 'protocol.expenses.types.toll' },
  { value: 'parking', labelKey: 'protocol.expenses.types.parking' },
  { value: 'other', labelKey: 'protocol.expenses.types.other' },
];

const DAMAGE_DELAY_SECONDS = 60;

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
  const [damageUploads, setDamageUploads] = useState({});
  const [pendingDamagePhoto, setPendingDamagePhoto] = useState(null);
  const [expenseUploads, setExpenseUploads] = useState({});
  const [photoCameraActive, setPhotoCameraActive] = useState(false);
  const [activeChecklistId, setActiveChecklistId] = useState(checklistId);
  const draftCreateRef = useRef(null);
  const [damageDelay, setDamageDelay] = useState({
    open: false,
    startedAt: null,
    remaining: DAMAGE_DELAY_SECONDS,
    nextStep: null,
    done: false,
  });

  const [formData, setFormData] = useState({
    order_id: orderId,
    type: type,
    datetime: new Date().toISOString(),
    location: '',
    kilometer: '',
    fuel_level: '1/2',
    fuel_cost: '',
    cleanliness_inside: 'normal',
    cleanliness_outside: 'normal',
    lighting: 'day',
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
    expenses: [],
    notes: '',
    mandatory_checks: {},
    signature_driver: '',
    signature_customer: '',
    customer_name: '',
    signature_refused: false,
    signature_refused_by: '',
    signature_refused_reason: '',
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
    queryKey: ['checklist', activeChecklistId],
    queryFn: async () => {
      if (!activeChecklistId) return null;
      const checklists = await appClient.entities.Checklist.filter({ id: activeChecklistId });
      return checklists[0];
    },
    enabled: !!activeChecklistId,
  });
  const isViewOnly = Boolean(activeChecklistId && existingChecklist?.completed);

  useEffect(() => {
    if (existingChecklist) {
      setFormData({
        ...existingChecklist,
        kilometer: existingChecklist.kilometer?.toString() || '',
        fuel_cost: existingChecklist.fuel_cost?.toString() || '',
        expenses: existingChecklist.expenses || [],
        lighting: existingChecklist.lighting || 'day',
        signature_refused: existingChecklist.signature_refused ?? false,
        signature_refused_by: existingChecklist.signature_refused_by || '',
        signature_refused_reason: existingChecklist.signature_refused_reason || ''
      });
    }
  }, [existingChecklist]);

  useEffect(() => {
    if (pendingDamagePhoto === null) return;
    const input = document.getElementById(`damage-photo-${pendingDamagePhoto}`);
    if (input) {
      input.click();
      setPendingDamagePhoto(null);
    }
  }, [pendingDamagePhoto]);

  useEffect(() => {
    if (!damageDelay.startedAt || damageDelay.done) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - damageDelay.startedAt) / 1000);
      const nextRemaining = Math.max(0, DAMAGE_DELAY_SECONDS - elapsed);
      setDamageDelay((prev) => {
        if (!prev.startedAt || prev.done) return prev;
        const nextState = { ...prev, remaining: nextRemaining };
        if (nextRemaining === 0) {
          nextState.done = true;
        }
        return nextState;
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [damageDelay.startedAt, damageDelay.done]);

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

  const clearDamages = () => {
    if (isViewOnly) return;
    setFormData((prev) => ({ ...prev, damages: [] }));
  };

  const addDamage = () => {
    setFormData((prev) => {
      const used = new Set((prev.damages || []).map((damage) => damage.slot_id).filter(Boolean));
      const nextLocation = DAMAGE_LOCATIONS.find((location) => !used.has(location.id)) || null;
      return {
        ...prev,
        damages: [
          ...prev.damages,
          {
            slot_id: nextLocation?.id || '',
            location: nextLocation ? t(nextLocation.labelKey) : '',
            description: '',
            severity: 'minor',
            type: '',
            photo_url: '',
          },
        ],
      };
    });
  };

  const updateDamageLocation = (index, locationId) => {
    const selected = DAMAGE_LOCATIONS.find((location) => location.id === locationId);
    setFormData((prev) => {
      const newDamages = [...prev.damages];
      newDamages[index] = {
        ...newDamages[index],
        slot_id: locationId,
        location: selected ? t(selected.labelKey) : '',
      };
      return { ...prev, damages: newDamages };
    });
  };

  const updateDamage = (index, field, value) => {
    setFormData((prev) => {
      const newDamages = [...prev.damages];
      newDamages[index] = { ...newDamages[index], [field]: value };
      return { ...prev, damages: newDamages };
    });
    if (field === 'type' && value && !formData.damages?.[index]?.photo_url) {
      const locationValue = formData.damages?.[index]?.location;
      if (!locationValue) {
        return;
      }
      setPendingDamagePhoto(index);
    }
  };

  const removeDamage = (index) => {
    setFormData(prev => ({
      ...prev,
      damages: prev.damages.filter((_, i) => i !== index)
    }));
    setDamageUploads(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const getDamageLocationValue = (damage) => {
    if (!damage) return '';
    if (damage.slot_id && DAMAGE_LOCATIONS.some((location) => location.id === damage.slot_id)) {
      return damage.slot_id;
    }
    const match = DAMAGE_LOCATIONS.find((location) => t(location.labelKey) === damage.location);
    return match?.id || '';
  };

  const uploadDamagePhoto = async (index, file) => {
    if (!file) return;
    setDamageUploads(prev => ({ ...prev, [index]: true }));
    setSubmitError('');
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      setFormData(prev => {
        const damages = [...prev.damages];
        damages[index] = { ...damages[index], photo_url: file_url };
        const photoType = `damage-${index + 1}`;
        const damagePhoto = {
          type: photoType,
          url: file_url,
          caption: t('protocol.damage.photoCaption', { index: index + 1 }),
        };
        const photos = (prev.photos || []).filter(p => p.type !== photoType);
        return { ...prev, damages, photos: [...photos, damagePhoto] };
      });
    } catch (error) {
      console.error('Damage photo upload failed', error);
      setSubmitError(t('protocol.errors.damagePhotoMissing'));
    } finally {
      setDamageUploads(prev => ({ ...prev, [index]: false }));
    }
  };

  const addExpense = () => {
    setFormData((prev) => ({
      ...prev,
      expenses: [
        ...(prev.expenses || []),
        { type: 'fuel', amount: '', note: '', file_url: '', file_name: '', file_type: '' },
      ],
    }));
  };

  const updateExpense = (index, field, value) => {
    setFormData((prev) => {
      const expenses = [...(prev.expenses || [])];
      expenses[index] = { ...expenses[index], [field]: value };
      return { ...prev, expenses };
    });
  };

  const removeExpense = (index) => {
    setFormData((prev) => ({
      ...prev,
      expenses: (prev.expenses || []).filter((_, i) => i !== index),
    }));
    setExpenseUploads((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const uploadExpenseFile = async (index, file) => {
    if (!file) return;
    setExpenseUploads((prev) => ({ ...prev, [index]: true }));
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      setFormData((prev) => {
        const expenses = [...(prev.expenses || [])];
        expenses[index] = {
          ...expenses[index],
          file_url,
          file_name: file.name,
          file_type: file.type,
        };
        return { ...prev, expenses };
      });
    } catch (error) {
      console.error('Expense upload failed', error);
      setSubmitError(t('protocol.expenses.uploadError'));
    } finally {
      setExpenseUploads((prev) => ({ ...prev, [index]: false }));
    }
  };

  const buildDraftPayload = (overrides = {}) => ({
    ...formData,
    ...overrides,
    order_id: orderId,
    order_number: order?.order_number,
    driver_id: currentDriver?.id,
    driver_name: currentDriver?.name,
    kilometer: formData.kilometer ? parseFloat(formData.kilometer) : null,
    fuel_cost: formData.fuel_cost ? parseFloat(formData.fuel_cost) : null,
    completed: false,
  });

  const ensureChecklistDraft = async (overrides = {}) => {
    if (activeChecklistId) {
      return { id: activeChecklistId, created: false };
    }
    if (draftCreateRef.current) {
      return draftCreateRef.current;
    }
    draftCreateRef.current = (async () => {
      const created = await createMutation.mutateAsync(buildDraftPayload(overrides));
      setActiveChecklistId(created.id);
      const params = new URLSearchParams(window.location.search);
      params.set('checklistId', created.id);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      draftCreateRef.current = null;
      return { id: created.id, created: true };
    })();
    return draftCreateRef.current;
  };

  // Draft auto-save removed: only save when the protocol is submitted.

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
    if (type === 'pickup') {
      const damageHasGaps = formData.damages?.some(
        (damage) => !damage.location || !damage.description || !damage.type
      );
      if (damageHasGaps) {
        setSubmitError(t('protocol.errors.damageIncomplete'));
        setCurrentStep('damage');
        return;
      }
      const damagePhotoMissing = formData.damages?.some((damage) => !damage.photo_url);
      if (damagePhotoMissing) {
        setSubmitError(t('protocol.errors.damagePhotoMissing'));
        setCurrentStep('damage');
        return;
      }
    }
    if (!formData.signature_driver) {
      setSubmitError(t('protocol.errors.missingDriverSignature'));
      setCurrentStep('signatures');
      return;
    }
    const dropoffRefused = type === 'dropoff' && formData.signature_refused;
    if (dropoffRefused) {
      if (!formData.signature_refused_by || !formData.signature_refused_reason) {
        setSubmitError(t('protocol.errors.signatureRefusalIncomplete'));
        setCurrentStep('signatures');
        return;
      }
    } else {
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
        fuel_cost: formData.fuel_cost ? parseFloat(formData.fuel_cost) : null,
        completed: true
      };

      if (activeChecklistId) {
        await updateMutation.mutateAsync({ id: activeChecklistId, data: dataToSave });
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

  const damageHasGaps =
    type === 'pickup' &&
    formData.damages?.some((damage) => !damage.location || !damage.description || !damage.type);
  const hasAllRequiredPhotos = REQUIRED_PHOTO_IDS.every((id) =>
    formData.photos?.some((photo) => photo.type === id)
  );
  const damagesComplete =
    type !== 'pickup' ||
    !formData.damages?.length ||
    formData.damages.every((damage) => damage.location && damage.description && damage.type && damage.photo_url);
  const photosComplete = hasAllRequiredPhotos;
  const damageComplete = type !== 'pickup' ? true : damagesComplete;
  const expensesComplete = !Object.values(expenseUploads).some(Boolean);
  const signatureRefused = type === 'dropoff' && formData.signature_refused;
  const signatureRefusedComplete = signatureRefused
    ? Boolean(formData.signature_refused_by && formData.signature_refused_reason)
    : false;
  const signaturesComplete = Boolean(
    formData.signature_driver &&
      (signatureRefused
        ? signatureRefusedComplete
        : formData.signature_customer && formData.customer_name)
  );
  const finalStep = type === 'dropoff' ? 'expenses' : 'signatures';

  const isImageFile = (expense) => {
    if (!expense?.file_url) return false;
    if (expense.file_type?.startsWith('image/')) return true;
    return /\.(png|jpe?g|webp|gif|svg)$/i.test(expense.file_url);
  };

  const getStepBlockingReason = (stepId) => {
    if (stepId === 'vehicle_check' && !formData.kilometer) {
      return t('protocol.errors.missingKilometer');
    }
    if (stepId === 'photos') {
      if (!hasAllRequiredPhotos) {
        return t('protocol.errors.missingPhotos');
      }
    }
    if (stepId === 'damage' && type === 'pickup') {
      if (damageHasGaps) {
        return t('protocol.errors.damageIncomplete');
      }
      if (formData.damages?.some((damage) => !damage.photo_url)) {
        return t('protocol.errors.damagePhotoMissing');
      }
    }
    if (stepId === 'signatures') {
      if (!formData.signature_driver) {
        return t('protocol.errors.missingSignatures');
      }
      if (signatureRefused) {
        if (!signatureRefusedComplete) {
          return t('protocol.errors.signatureRefusalIncomplete');
        }
        return '';
      }
      if (!formData.customer_name || !formData.signature_customer) {
        return t('protocol.errors.missingSignatures');
      }
    }
    return '';
  };

  const completedSteps = isViewOnly
    ? (type === 'pickup' ? ['vehicle_check', 'photos', 'damage', 'signatures'] : ['vehicle_check', 'photos', 'signatures', 'expenses'])
    : [
        formData.kilometer ? 'vehicle_check' : null,
        photosComplete ? 'photos' : null,
        type === 'pickup' && damageComplete ? 'damage' : null,
        signaturesComplete ? 'signatures' : null,
        type === 'dropoff' && expensesComplete ? 'expenses' : null,
      ].filter(Boolean);

  const steps = useMemo(
    () =>
      type === 'pickup'
        ? [
            { id: 'vehicle_check', labelKey: 'protocol.steps.basics', icon: '🚗' },
            { id: 'photos', labelKey: 'protocol.steps.photos', icon: '📸' },
            { id: 'damage', labelKey: 'protocol.steps.damage', icon: '🧩' },
            { id: 'signatures', labelKey: 'protocol.steps.signatures', icon: '✍️' },
          ]
        : [
            { id: 'vehicle_check', labelKey: 'protocol.steps.basics', icon: '🚗' },
            { id: 'photos', labelKey: 'protocol.steps.photos', icon: '📸' },
            { id: 'signatures', labelKey: 'protocol.steps.signatures', icon: '✍️' },
            { id: 'expenses', labelKey: 'protocol.steps.expenses', icon: '🧾' },
          ],
    [type]
  );

  const handleBeforeNext = (stepId, nextStep) => {
    if (isViewOnly) return true;
    const reason = getStepBlockingReason(stepId);
    if (reason) {
      setSubmitError(reason);
      return false;
    }
    if (stepId === 'damage' && type === 'pickup' && !damageDelay.done) {
      setDamageDelay((prev) => ({
        ...prev,
        open: true,
        startedAt: prev.startedAt || Date.now(),
        remaining: prev.startedAt ? prev.remaining : DAMAGE_DELAY_SECONDS,
        nextStep: nextStep || null,
      }));
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
        steps={steps}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepChange={setCurrentStep}
        onBeforeNext={handleBeforeNext}
        hideFooter={photoCameraActive}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('protocol.basics.lighting')}</Label>
                    <Select
                      value={formData.lighting}
                      onValueChange={(v) => handleChange('lighting', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">{t('protocol.basics.lightingOptions.day')}</SelectItem>
                        <SelectItem value="dark">{t('protocol.basics.lightingOptions.dark')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {type === 'dropoff' && (
                  <div>
                    <Label>{t('protocol.basics.fuelCost')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.fuel_cost}
                      onChange={(e) => handleChange('fuel_cost', e.target.value)}
                      placeholder={t('protocol.basics.fuelCostPlaceholder')}
                      disabled={isViewOnly}
                    />
                  </div>
                )}
                {type === 'pickup' && (
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
                )}
              </CardContent>
            </Card>
          )}

          {currentStep === 'photos' && (
            <div className="space-y-4">
              <PhotoCapture
                photos={formData.photos}
                onChange={(photos) => handleChange('photos', photos)}
                readOnly={isViewOnly}
                onCameraActiveChange={setPhotoCameraActive}
              />
            </div>
          )}

          {currentStep === 'damage' && type === 'pickup' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5 text-gray-600" />
                  {t('protocol.damage.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-600">
                    {t('protocol.damage.instructions')}
                  </p>
                </div>

                {formData.damages?.map((damage, index) => (
                  <div
                    key={index}
                    className="p-3 border rounded-lg relative"
                  >
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
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                          {index + 1}
                        </span>
                        {t('protocol.damage.cardTitle')}
                      </div>
                      <div>
                        <Label>{t('protocol.damage.location')}</Label>
                        <Select
                          value={getDamageLocationValue(damage)}
                          onValueChange={(value) => updateDamageLocation(index, value)}
                          disabled={isViewOnly}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('protocol.damage.locationPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {DAMAGE_LOCATIONS.map((location) => (
                              <SelectItem key={location.id} value={location.id}>
                                {t(location.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('protocol.damage.type')}</Label>
                        <Select
                          value={damage.type || undefined}
                          onValueChange={(v) => updateDamage(index, 'type', v)}
                          disabled={isViewOnly || !damage.location}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('protocol.damage.typePlaceholder')} />
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
                      <div>
                        <Label>{t('protocol.damage.photoLabel')}</Label>
                        <div className="flex items-center gap-3 mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById(`damage-photo-${index}`)?.click()}
                            disabled={!damage.type || !damage.location || damageUploads[index]}
                          >
                            {damageUploads[index]
                              ? t('protocol.damage.photoUploading')
                              : t('protocol.damage.photoButton')}
                          </Button>
                          {damage.photo_url && (
                            <img
                              src={damage.photo_url}
                              alt={t('protocol.damage.photoPreview', { index: index + 1 })}
                              className="h-16 w-20 rounded border object-cover"
                            />
                          )}
                        </div>
                        {!damage.photo_url && (
                          <p className="text-xs text-slate-500 mt-2">{t('protocol.damage.photoHelp')}</p>
                        )}
                        <input
                          id={`damage-photo-${index}`}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              uploadDamagePhoto(index, file);
                            }
                            event.target.value = '';
                          }}
                        />
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
                {type === 'dropoff' && !isViewOnly && (
                  <Card className="border-slate-200">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label>{t('protocol.signatures.refusedLabel')}</Label>
                          <p className="text-xs text-slate-500">{t('protocol.signatures.refusedHelp')}</p>
                        </div>
                        <Switch
                          checked={formData.signature_refused}
                          onCheckedChange={(value) => handleChange('signature_refused', value)}
                        />
                      </div>
                      {formData.signature_refused && (
                        <div className="space-y-3">
                          <div>
                            <Label>{t('protocol.signatures.refusedBy')}</Label>
                            <Input
                              value={formData.signature_refused_by}
                              onChange={(e) => handleChange('signature_refused_by', e.target.value)}
                              placeholder={t('protocol.signatures.refusedByPlaceholder')}
                              disabled={isViewOnly}
                            />
                          </div>
                          <div>
                            <Label>{t('protocol.signatures.refusedReason')}</Label>
                            <Textarea
                              value={formData.signature_refused_reason}
                              onChange={(e) => handleChange('signature_refused_reason', e.target.value)}
                              placeholder={t('protocol.signatures.refusedReasonPlaceholder')}
                              rows={3}
                              disabled={isViewOnly}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
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
                      ...(signatureRefused
                        ? []
                        : [{
                        key: 'customer',
                        label: t('protocol.signatures.customerSignature'),
                        value: formData.signature_customer,
                        onChange: (v) => handleChange('signature_customer', v),
                      }]),
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
                  <div className="space-y-3">
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
                      {formData.signature_customer && !signatureRefused && (
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
                    {signatureRefused && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                        <p className="font-semibold">{t('protocol.signatures.refusedLabel')}</p>
                        <p className="mt-1">
                          {t('protocol.signatures.refusedBy')}: {formData.signature_refused_by || "-"}
                        </p>
                        <p className="mt-1">
                          {t('protocol.signatures.refusedReason')}: {formData.signature_refused_reason || "-"}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!isViewOnly && currentStep === finalStep && (
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

          {currentStep === 'expenses' && type === 'dropoff' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="w-5 h-5 text-gray-600" />
                  {t('protocol.expenses.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <p className="text-sm text-slate-600">{t('protocol.expenses.subtitle')}</p>

                {formData.expenses?.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    {t('protocol.expenses.empty')}
                  </div>
                )}

                <div className="space-y-4">
                  {formData.expenses?.map((expense, index) => (
                    <div key={`${expense.type}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-slate-700">
                          {t('protocol.expenses.itemTitle', { index: index + 1 })}
                        </span>
                        {!isViewOnly && (
                          <Button size="icon" variant="ghost" onClick={() => removeExpense(index)}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <Label>{t('protocol.expenses.type')}</Label>
                          <Select
                            value={expense.type || 'fuel'}
                            onValueChange={(value) => updateExpense(index, 'type', value)}
                            disabled={isViewOnly}
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
                          <Label>{t('protocol.expenses.amount')}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={expense.amount || ''}
                            onChange={(event) => updateExpense(index, 'amount', event.target.value)}
                            placeholder="0.00"
                            disabled={isViewOnly}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <Label>{t('protocol.expenses.note')}</Label>
                          <Input
                            value={expense.note || ''}
                            onChange={(event) => updateExpense(index, 'note', event.target.value)}
                            placeholder={t('protocol.expenses.notePlaceholder')}
                            disabled={isViewOnly}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label>{t('protocol.expenses.receipt')}</Label>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById(`expense-file-${index}`)?.click()}
                            disabled={expenseUploads[index]}
                          >
                            {expenseUploads[index]
                              ? t('protocol.expenses.uploading')
                              : t('protocol.expenses.upload')}
                          </Button>
                          {expense.file_url && isImageFile(expense) && (
                            <img
                              src={expense.file_url}
                              alt={expense.file_name || t('protocol.expenses.receipt')}
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
                              {expense.file_name || t('protocol.expenses.view')}
                            </a>
                          )}
                        </div>
                        <input
                          id={`expense-file-${index}`}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              uploadExpenseFile(index, file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {!isViewOnly && (
                  <Button variant="outline" className="w-full" onClick={addExpense}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('protocol.expenses.add')}
                  </Button>
                )}

                {!isViewOnly && currentStep === finalStep && (
                  <Button
                    className="w-full py-5 text-lg bg-green-600 hover:bg-green-700"
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
            <DialogDescription className="sr-only">
              {t('protocol.signatures.signatureHint')}
            </DialogDescription>
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

      <Dialog
        open={damageDelay.open}
        onOpenChange={(open) => {
          if (!open) {
            setDamageDelay((prev) => ({
              ...prev,
              open: false,
            }));
          }
        }}
      >
        <DialogContent className="w-[92vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t('protocol.damage.waitTitle')}</DialogTitle>
            <DialogDescription>{t('protocol.damage.waitMessage', { seconds: damageDelay.remaining })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-600 space-y-2">
              <p>{t('protocol.damage.waitCountdown', { seconds: damageDelay.remaining })}</p>
              <p>{t('protocol.damage.waitWarning')}</p>
            </div>
            <Button
              className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
              disabled={damageDelay.remaining > 0}
              onClick={() => {
                if (damageDelay.remaining > 0) return;
                const next = damageDelay.nextStep;
                setDamageDelay((prev) => ({
                  ...prev,
                  open: false,
                  done: true,
                  nextStep: null,
                }));
                if (next) {
                  setCurrentStep(next);
                }
              }}
            >
              {t('protocol.damage.waitButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
