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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import SignaturePad from '@/components/driver/SignaturePad';
import PhotoCapture, { REQUIRED_PHOTO_IDS } from '@/components/driver/PhotoCapture';
import MandatoryChecklist, { MANDATORY_CHECKS } from '@/components/driver/MandatoryChecklist';
import { 
  ArrowLeft,
  Save,
  Loader2,
  Camera,
  Car,
  Fuel,
  ClipboardList,
  AlertTriangle,
  PenTool,
  CheckCircle2,
  Plus,
  X
} from 'lucide-react';

export default function DriverProtocol() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  const type = urlParams.get('type'); // pickup or dropoff
  const checklistId = urlParams.get('checklistId');

  const [user, setUser] = useState(null);
  const [currentDriver, setCurrentDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('basic');
  const [submitError, setSubmitError] = useState('');

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

  const handleSubmit = async () => {
    const missingPhotoIds = REQUIRED_PHOTO_IDS.filter((id) => !formData.photos?.some((photo) => photo.type === id));
    const missingChecks = MANDATORY_CHECKS.filter(
      (check) => formData.mandatory_checks?.[check.id] === undefined
    );
    if (!formData.kilometer) {
      setSubmitError('Bitte Kilometerstand eintragen.');
      setActiveSection('basic');
      return;
    }
    if (missingPhotoIds.length > 0) {
      setSubmitError('Bitte alle Pflichtfotos aufnehmen.');
      setActiveSection('photos');
      return;
    }
    if (missingChecks.length > 0) {
      setSubmitError('Bitte alle Pflichtprüfungen beantworten.');
      setActiveSection('mandatory');
      return;
    }
    if (!formData.signature_driver) {
      setSubmitError('Bitte die Unterschrift des Fahrers erfassen.');
      setActiveSection('notes');
      return;
    }
    if (!formData.signature_customer) {
      setSubmitError('Bitte die Unterschrift des Kunden erfassen.');
      setActiveSection('notes');
      return;
    }
    if (!formData.customer_name) {
      setSubmitError('Bitte den Namen des Kunden eintragen.');
      setActiveSection('notes');
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

      <div className="p-4 space-y-4">
        {submitError && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {submitError}
          </div>
        )}
        {appSettings && appSettings.instructions && (
          <Card>
            <CardContent className="p-4 text-sm text-gray-600 whitespace-pre-wrap">
              <span className="block font-semibold text-gray-900 mb-1">Hinweise für Fahrer</span>
              {appSettings.instructions}
            </CardContent>
          </Card>
        )}
        <Accordion type="single" value={activeSection} onValueChange={setActiveSection} collapsible>
          {/* Basic Info */}
          <AccordionItem value="basic">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-gray-600" />
                <span>Grunddaten</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Card>
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
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          {/* Accessories */}
          <AccordionItem value="accessories">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-gray-600" />
                <span>Zubehör</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
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
                  ].map(item => (
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
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          {/* Mandatory Checks */}
          <AccordionItem value="mandatory">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-gray-600" />
                <span>Pflicht-Prüfungen</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <MandatoryChecklist
                checks={formData.mandatory_checks || {}}
                onChange={(checks) => handleChange('mandatory_checks', checks)}
                onComplete={() => setActiveSection('photos')}
                readOnly={isViewOnly}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Photos */}
          <AccordionItem value="photos">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-gray-600" />
                <span>Fotos ({formData.photos?.length || 0})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <PhotoCapture 
                photos={formData.photos}
                onChange={(photos) => handleChange('photos', photos)}
                readOnly={isViewOnly}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Damages */}
          <AccordionItem value="damages">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-gray-600" />
                <span>Schäden ({formData.damages?.length || 0})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
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
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={addDamage}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Schaden hinzufügen
                    </Button>
                  )}
                  {formData.damages?.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      Keine Schäden erfasst
                    </p>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          {/* Notes */}
          <AccordionItem value="notes">
            <AccordionTrigger className="px-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <PenTool className="w-5 h-5 text-gray-600" />
                <span>Bemerkungen & Unterschriften</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Card>
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
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Submit Button */}
        {!isViewOnly && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
            <Button 
              className={`w-full py-6 text-lg ${type === 'pickup' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
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
          </div>
        )}
      </div>
    </div>
  );
}
