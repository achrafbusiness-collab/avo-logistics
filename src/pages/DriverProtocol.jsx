import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
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
  DialogFooter,
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
import MandatoryChecklist, { MANDATORY_CHECKS } from '@/components/driver/MandatoryChecklist';
import ProtocolWizard from '@/components/driver/ProtocolWizard';
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

const STEP_CONFIRMATIONS = {
  vehicle_check: [
    { id: 'km', label: 'Kilometerstand korrekt erfasst' },
    { id: 'fuel', label: 'Tankstand korrekt angegeben' },
    { id: 'clean', label: 'Sauberkeit innen/außen eingetragen' },
    { id: 'accessories', label: 'Zubehör geprüft und eingetragen' },
  ],
  photos: [
    { id: 'photos', label: 'Alle Pflichtfotos aufgenommen' },
    { id: 'damage_photos', label: 'Schäden fotografiert (falls vorhanden)' },
  ],
  checklist: [
    { id: 'mandatory', label: 'Alle Pflichtprüfungen beantwortet' },
    { id: 'damages', label: 'Schäden geprüft und dokumentiert' },
  ],
  signatures: [
    { id: 'customer', label: 'Name des Kunden geprüft' },
    { id: 'signatures', label: 'Unterschriften Fahrer & Kunde vorhanden' },
    { id: 'notes', label: 'Bemerkungen geprüft' },
  ],
};

const DAMAGE_POINTS = [
  { id: 'front-left', label: 'Front links', x: 18, y: 20 },
  { id: 'front-right', label: 'Front rechts', x: 82, y: 20 },
  { id: 'hood', label: 'Motorhaube', x: 50, y: 18 },
  { id: 'roof', label: 'Dach', x: 50, y: 38 },
  { id: 'left-side', label: 'Seite links', x: 20, y: 50 },
  { id: 'right-side', label: 'Seite rechts', x: 80, y: 50 },
  { id: 'rear-left', label: 'Heck links', x: 18, y: 78 },
  { id: 'rear-right', label: 'Heck rechts', x: 82, y: 78 },
  { id: 'trunk', label: 'Kofferraum', x: 50, y: 80 },
  { id: 'glass', label: 'Scheiben', x: 50, y: 55 },
];

export default function DriverProtocol() {
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(null);
  const [confirmChecks, setConfirmChecks] = useState({});

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
    setFormData((prev) => {
      const existing = prev.damages?.some((damage) => damage.location === point.label);
      if (existing) return prev;
      const nextDamages = [
        ...(prev.damages || []),
        { location: point.label, description: '', severity: 'minor', type: 'K' },
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
    const missingChecks = MANDATORY_CHECKS.filter(
      (check) => formData.mandatory_checks?.[check.id] === undefined
    );
    if (!formData.kilometer) {
      setSubmitError('Bitte Kilometerstand eintragen.');
      setCurrentStep('vehicle_check');
      return;
    }
    if (missingPhotoIds.length > 0) {
      setSubmitError('Bitte alle Pflichtfotos aufnehmen.');
      setCurrentStep('photos');
      return;
    }
    if (missingChecks.length > 0) {
      setSubmitError('Bitte alle Pflichtprüfungen beantworten.');
      setCurrentStep('checklist');
      return;
    }
    const damageHasGaps = formData.damages?.some(
      (damage) => !damage.location || !damage.description
    );
    if (damageHasGaps) {
      setSubmitError('Bitte alle Schadensfelder vollständig ausfüllen oder Einträge entfernen.');
      setCurrentStep('checklist');
      return;
    }
    if (!formData.signature_driver) {
      setSubmitError('Bitte die Unterschrift des Fahrers erfassen.');
      setCurrentStep('signatures');
      return;
    }
    if (!formData.signature_customer) {
      setSubmitError('Bitte die Unterschrift des Kunden erfassen.');
      setCurrentStep('signatures');
      return;
    }
    if (!formData.customer_name) {
      setSubmitError('Bitte den Namen des Kunden eintragen.');
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

  const openConfirmForStep = (stepId, nextStepId, action) => {
    const items = STEP_CONFIRMATIONS[stepId] || [];
    const nextChecks = items.reduce((acc, item) => {
      acc[item.id] = false;
      return acc;
    }, {});
    setConfirmChecks(nextChecks);
    setConfirmStep({ stepId, nextStepId, action });
    setConfirmOpen(true);
  };

  const isViewOnly = !!checklistId && existingChecklist?.completed;
  const damageHasGaps = formData.damages?.some(
    (damage) => !damage.location || !damage.description
  );
  const hasAllMandatoryChecks =
    MANDATORY_CHECKS.length > 0 &&
    MANDATORY_CHECKS.every((check) => formData.mandatory_checks?.[check.id] !== undefined);
  const hasAllRequiredPhotos = REQUIRED_PHOTO_IDS.every((id) =>
    formData.photos?.some((photo) => photo.type === id)
  );
  const damagesComplete =
    !formData.damages?.length ||
    formData.damages.every((damage) => damage.location && damage.description);
  const checklistComplete = hasAllMandatoryChecks && damagesComplete;

  const getStepBlockingReason = (stepId) => {
    if (stepId === 'vehicle_check' && !formData.kilometer) {
      return 'Bitte Kilometerstand eintragen.';
    }
    if (stepId === 'photos' && !hasAllRequiredPhotos) {
      return 'Bitte alle Pflichtfotos aufnehmen.';
    }
    if (stepId === 'checklist') {
      if (!hasAllMandatoryChecks) {
        return 'Bitte alle Pflichtprüfungen beantworten.';
      }
      if (damageHasGaps) {
        return 'Bitte alle Schadensfelder vollständig ausfüllen oder Einträge entfernen.';
      }
    }
    if (stepId === 'signatures') {
      if (!formData.customer_name || !formData.signature_driver || !formData.signature_customer) {
        return 'Bitte Name und Unterschriften vollständig erfassen.';
      }
    }
    return '';
  };

  const completedSteps = isViewOnly
    ? ['vehicle_check', 'photos', 'checklist', 'signatures']
    : [
        formData.kilometer ? 'vehicle_check' : null,
        hasAllRequiredPhotos ? 'photos' : null,
        checklistComplete ? 'checklist' : null,
        formData.signature_driver && formData.signature_customer && formData.customer_name
          ? 'signatures'
          : null,
      ].filter(Boolean);

  const handleBeforeNext = (stepId, nextStepId) => {
    if (isViewOnly) return true;
    openConfirmForStep(stepId, nextStepId, 'next');
    return false;
  };

  const handleSubmit = () => {
    if (isViewOnly) return;
    openConfirmForStep('signatures', null, 'submit');
  };

  const confirmItems = confirmStep ? STEP_CONFIRMATIONS[confirmStep.stepId] || [] : [];
  const allConfirmed = confirmItems.length > 0 && confirmItems.every((item) => confirmChecks[item.id]);
  const blockingReason = confirmStep ? getStepBlockingReason(confirmStep.stepId) : '';

  const handleConfirmContinue = async () => {
    if (!confirmStep || blockingReason || !allConfirmed) return;
    const action = confirmStep.action;
    const nextStepId = confirmStep.nextStepId;
    setConfirmOpen(false);
    setConfirmStep(null);
    setConfirmChecks({});
    if (action === 'next' && nextStepId) {
      setCurrentStep(nextStepId);
      return;
    }
    if (action === 'submit') {
      await submitProtocol();
    }
  };

  const handleConfirmOpenChange = (open) => {
    setConfirmOpen(open);
    if (!open) {
      setConfirmStep(null);
      setConfirmChecks({});
    }
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className={`${type === 'pickup' ? 'bg-blue-600' : 'bg-green-600'} text-white px-4 py-6`}>
        <Link to={createPageUrl('DriverChecklist') + `?orderId=${orderId}`} className="inline-flex items-center text-white/80 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Link>
        <h1 className="text-2xl font-bold">
          {type === 'pickup' ? 'Abholprotokoll' : 'Abgabeprotokoll'}
        </h1>
        <p className="text-white/70">{order?.order_number} • {order?.license_plate}</p>
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
                <span className="block font-semibold text-gray-900 mb-1">Hinweise für Fahrer</span>
                {appSettings.instructions}
              </CardContent>
            </Card>
          )}

          {currentStep === 'vehicle_check' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Car className="w-5 h-5 text-gray-600" />
                  Grunddaten & Zubehör
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label>Ort</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder="Aktueller Standort"
                    disabled={isViewOnly}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Kilometerstand *</Label>
                    <Input
                      type="number"
                      value={formData.kilometer}
                      onChange={(e) => handleChange('kilometer', e.target.value)}
                      placeholder="z.B. 125000"
                      disabled={isViewOnly}
                    />
                  </div>
                  <div>
                    <Label>Tankstand</Label>
                    <Select
                      value={formData.fuel_level}
                      onValueChange={(v) => handleChange('fuel_level', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empty">Leer</SelectItem>
                        <SelectItem value="1/4">1/4</SelectItem>
                        <SelectItem value="1/2">1/2</SelectItem>
                        <SelectItem value="3/4">3/4</SelectItem>
                        <SelectItem value="full">Voll</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Sauberkeit innen</Label>
                    <Select
                      value={formData.cleanliness_inside}
                      onValueChange={(v) => handleChange('cleanliness_inside', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clean">Sauber</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="dirty">Verschmutzt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Sauberkeit außen</Label>
                    <Select
                      value={formData.cleanliness_outside}
                      onValueChange={(v) => handleChange('cleanliness_outside', v)}
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clean">Sauber</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="dirty">Verschmutzt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  {[
                    { id: 'spare_wheel', label: 'Reserverad' },
                    { id: 'warning_triangle', label: 'Warndreieck' },
                    { id: 'first_aid_kit', label: 'Verbandskasten' },
                    { id: 'safety_vest', label: 'Warnweste' },
                    { id: 'car_jack', label: 'Wagenheber' },
                    { id: 'wheel_wrench', label: 'Radmutternschlüssel' },
                    { id: 'manual', label: 'Bedienungsanleitung' },
                    { id: 'service_book', label: 'Serviceheft' },
                    { id: 'registration_doc', label: 'Fahrzeugschein' },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span>{item.label}</span>
                      <Switch
                        checked={formData.accessories[item.id]}
                        onCheckedChange={(v) => handleAccessoryChange(item.id, v)}
                        disabled={isViewOnly}
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <Label>Anzahl Schlüssel</Label>
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
            <PhotoCapture
              photos={formData.photos}
              onChange={(photos) => handleChange('photos', photos)}
              readOnly={isViewOnly}
            />
          )}

          {currentStep === 'checklist' && (
            <div className="space-y-4">
              <MandatoryChecklist
                checks={formData.mandatory_checks || {}}
                onChange={(checks) => handleChange('mandatory_checks', checks)}
                readOnly={isViewOnly}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="w-5 h-5 text-gray-600" />
                    Schäden
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm text-slate-600 mb-2">
                      Tippe auf die Skizze, um die Schadensposition zu markieren.
                    </p>
                    <div className="relative overflow-hidden rounded-lg border bg-white">
                      <img
                        src="/vehicle-sketch.svg"
                        alt="Fahrzeugskizze"
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
                          aria-label={`Schaden markieren: ${point.label}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full border border-slate-200 px-2 py-1">K = Kratzer</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">S = Steinschlag</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">D = Delle</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">B = Beschädigung</span>
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
                          <Label>Position am Fahrzeug</Label>
                          <Input
                            value={damage.location}
                            onChange={(e) => updateDamage(index, 'location', e.target.value)}
                            placeholder="z.B. Vorne links, Stoßstange"
                            disabled={isViewOnly}
                          />
                        </div>
                        <div>
                          <Label>Art des Schadens</Label>
                          <Select
                            value={damage.type || 'K'}
                            onValueChange={(v) => updateDamage(index, 'type', v)}
                            disabled={isViewOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="K">Kratzer (K)</SelectItem>
                              <SelectItem value="S">Steinschlag (S)</SelectItem>
                              <SelectItem value="D">Delle (D)</SelectItem>
                              <SelectItem value="B">Beschädigung (B)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Beschreibung</Label>
                          <Input
                            value={damage.description}
                            onChange={(e) => updateDamage(index, 'description', e.target.value)}
                            placeholder="Art des Schadens"
                            disabled={isViewOnly}
                          />
                        </div>
                        <div>
                          <Label>Schweregrad</Label>
                          <Select
                            value={damage.severity}
                            onValueChange={(v) => updateDamage(index, 'severity', v)}
                            disabled={isViewOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minor">Leicht</SelectItem>
                              <SelectItem value="medium">Mittel</SelectItem>
                              <SelectItem value="severe">Schwer</SelectItem>
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
                        Schaden hinzufügen
                      </Button>
                      <Button variant="outline" className="w-full" onClick={clearDamages}>
                        Keine Schäden
                      </Button>
                    </div>
                  )}
                  {formData.damages?.length === 0 && (
                    <p className="text-center text-gray-500 py-4">Keine Schäden erfasst</p>
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
                  Bemerkungen & Unterschriften
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-6">
                <div>
                  <Label>Bemerkungen</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder="Weitere Anmerkungen..."
                    rows={3}
                    disabled={isViewOnly}
                  />
                </div>

                <div>
                  <Label>Name des Kunden</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => handleChange('customer_name', e.target.value)}
                    placeholder="Name des Empfängers/Übergebers"
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
                  <>
                    <SignaturePad
                      label="Unterschrift Fahrer"
                      value={formData.signature_driver}
                      onChange={(v) => handleChange('signature_driver', v)}
                    />
                    <SignaturePad
                      label="Unterschrift Kunde"
                      value={formData.signature_customer}
                      onChange={(v) => handleChange('signature_customer', v)}
                    />
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {formData.signature_driver && (
                      <div>
                        <Label>Unterschrift Fahrer</Label>
                        <img
                          src={formData.signature_driver}
                          alt="Unterschrift Fahrer"
                          className="border rounded mt-2 max-h-24"
                        />
                      </div>
                    )}
                    {formData.signature_customer && (
                      <div>
                        <Label>Unterschrift Kunde</Label>
                        <img
                          src={formData.signature_customer}
                          alt="Unterschrift Kunde"
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
                    Protokoll abschließen
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ProtocolWizard>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sicherheitspruefung</DialogTitle>
            <DialogDescription>
              Bitte bestaetige, dass alle Punkte korrekt geprueft wurden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {confirmItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="text-sm text-slate-700">{item.label}</span>
                <Switch
                  checked={!!confirmChecks[item.id]}
                  onCheckedChange={(value) =>
                    setConfirmChecks((prev) => ({ ...prev, [item.id]: value }))
                  }
                />
              </div>
            ))}
            {blockingReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {blockingReason}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => handleConfirmOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirmContinue} disabled={!allConfirmed || !!blockingReason}>
              Weiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
