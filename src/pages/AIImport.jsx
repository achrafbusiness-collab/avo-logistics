import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { getMapboxDistanceKm } from '@/utils/mapboxDistance';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Mail, 
  ArrowLeft, 
  Sparkles, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  Save
} from 'lucide-react';

export default function AIImport() {
  const queryClient = useQueryClient();
  const [emailText, setEmailText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedOrders, setExtractedOrders] = useState([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);
  const [importSuccess, setImportSuccess] = useState(false);
  const [customerEditOpen, setCustomerEditOpen] = useState({});
  const [error, setError] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState('');
  const lastCalcKeyRef = useRef('');

  const formatKm = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  };

  const normalizeText = (value) => String(value || '').trim().toLowerCase();
  const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.type === 'business' && customer.company_name) {
      return customer.company_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list(),
  });

  const customerOptions = useMemo(() => {
    return (customers || []).map((customer) => {
      const name = getCustomerDisplayName(customer) || customer.email || customer.customer_number || 'Kunde';
      const label = customer.customer_number ? `${name} (${customer.customer_number})` : name;
      return {
        id: customer.id,
        name,
        label,
        number: customer.customer_number || '',
        email: customer.email || '',
        phone: customer.phone || '',
      };
    });
  }, [customers]);

  const resolveCustomerMatch = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const direct = customerOptions.find((option) => option.label.toLowerCase() === normalized);
    if (direct) return direct;
    const byName = customerOptions.find((option) => option.name.toLowerCase() === normalized);
    if (byName) return byName;
    const numberMatch = trimmed.match(/\(([^)]+)\)\s*$/);
    if (numberMatch) {
      const number = numberMatch[1].trim().toLowerCase();
      const byNumber = customerOptions.find(
        (option) => option.number && option.number.toLowerCase() === number
      );
      if (byNumber) return byNumber;
    }
    const byNumber = customerOptions.find(
      (option) => option.number && option.number.toLowerCase() === normalized
    );
    return byNumber || null;
  };

  const resolveCustomerMatchForOrder = (order) => {
    if (!order) return null;
    if (order.customer_id) {
      return customerOptions.find((option) => option.id === order.customer_id) || null;
    }
    const email = normalizeText(order.customer_email);
    if (email) {
      const byEmail = customerOptions.find(
        (option) => normalizeText(option.email) === email
      );
      if (byEmail) return byEmail;
    }
    const phone = normalizePhone(order.customer_phone);
    if (phone) {
      const byPhone = customerOptions.find(
        (option) => normalizePhone(option.phone) === phone
      );
      if (byPhone) return byPhone;
    }
    const name = normalizeText(order.customer_name);
    if (name) {
      return resolveCustomerMatch(order.customer_name);
    }
    return null;
  };

  useEffect(() => {
    if (!customerOptions.length || !extractedOrders.length) return;
    setExtractedOrders((prev) => {
      let changed = false;
      const next = prev.map((order) => {
        if (order?._customerResolved) return order;
        const match = resolveCustomerMatchForOrder(order);
        if (match) {
          changed = true;
          return {
            ...order,
            customer_id: match.id,
            customer_name: match.name,
            customer_email: order.customer_email || match.email || '',
            customer_phone: order.customer_phone || match.phone || '',
            _customerResolved: true,
            _customerMatchType: 'auto',
          };
        }
        changed = true;
        return {
          ...order,
          _customerResolved: true,
          _customerMatchType: 'unmatched',
        };
      });
      return changed ? next : prev;
    });
  }, [customerOptions, extractedOrders.length]);

  const createOrderMutation = useMutation({
    mutationFn: (data) => appClient.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const normalizeExtractedData = (data) => ({
    customer_order_number: data?.customer_order_number || '',
    license_plate: data?.license_plate || '',
    vehicle_brand: data?.vehicle_brand || '',
    vehicle_model: data?.vehicle_model || '',
    vehicle_color: data?.vehicle_color || '',
    vin: data?.vin || '',
    pickup_address: data?.pickup_address || '',
    pickup_city: data?.pickup_city || '',
    pickup_postal_code: data?.pickup_postal_code || '',
    pickup_date: data?.pickup_date || '',
    pickup_time: data?.pickup_time || '',
    dropoff_address: data?.dropoff_address || '',
    dropoff_city: data?.dropoff_city || '',
    dropoff_postal_code: data?.dropoff_postal_code || '',
    dropoff_date: data?.dropoff_date || '',
    dropoff_time: data?.dropoff_time || '',
    customer_name: data?.customer_name || '',
    customer_phone: data?.customer_phone || '',
    customer_email: data?.customer_email || '',
    notes: data?.notes || '',
    distance_km: data?.distance_km ?? '',
    driver_price: data?.driver_price ?? '',
  });

  const analyzeEmail = async () => {
    if (!emailText.trim()) {
      setError('Bitte E-Mail-Text eingeben');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setImportSuccess(false);

    try {
      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Analysiere den folgenden Text (Deutsch) und extrahiere alle Aufträge zur Fahrzeugüberführung.
Es können ein oder mehrere Aufträge enthalten sein. Gib IMMER ein Objekt mit dem Feld "orders" zurück.

Text:
${emailText}

Extrahiere diese Felder. Wenn ein Feld nicht gefunden wird, gib "" (leerer String) zurück:
- customer_order_number (Kunden-Auftragsnummer / Referenz / Bestellnummer)
- license_plate (Kennzeichen)
- vehicle_brand (Marke)
- vehicle_model (Modell)
- vehicle_color (Farbe)
- vin (FIN/VIN/Fahrzeugnummer)
- pickup_address (Abholadresse vollständig)
- pickup_city (Abholort/Stadt)
- pickup_postal_code (Postleitzahl Abholung)
- pickup_date (YYYY-MM-DD)
- pickup_time (HH:MM)
- dropoff_address (Lieferadresse vollständig)
- dropoff_city (Zielort/Stadt)
- dropoff_postal_code (Postleitzahl Ziel)
- dropoff_date (YYYY-MM-DD)
- dropoff_time (HH:MM)
- customer_name
- customer_phone
- customer_email
- notes (Besondere Hinweise)

Gib ausschließlich die strukturierten Daten zurück.`,
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            orders: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  customer_order_number: { type: ["string", "null"] },
                  license_plate: { type: ["string", "null"] },
                  vehicle_brand: { type: ["string", "null"] },
                  vehicle_model: { type: ["string", "null"] },
                  vehicle_color: { type: ["string", "null"] },
                  vin: { type: ["string", "null"] },
                  pickup_address: { type: ["string", "null"] },
                  pickup_city: { type: ["string", "null"] },
                  pickup_postal_code: { type: ["string", "null"] },
                  pickup_date: { type: ["string", "null"] },
                  pickup_time: { type: ["string", "null"] },
                  dropoff_address: { type: ["string", "null"] },
                  dropoff_city: { type: ["string", "null"] },
                  dropoff_postal_code: { type: ["string", "null"] },
                  dropoff_date: { type: ["string", "null"] },
                  dropoff_time: { type: ["string", "null"] },
                  customer_name: { type: ["string", "null"] },
                  customer_phone: { type: ["string", "null"] },
                  customer_email: { type: ["string", "null"] },
                  notes: { type: ["string", "null"] }
                },
                required: [
                  "customer_order_number",
                  "license_plate",
                  "vehicle_brand",
                  "vehicle_model",
                  "vehicle_color",
                  "vin",
                  "pickup_address",
                  "pickup_city",
                  "pickup_postal_code",
                  "pickup_date",
                  "pickup_time",
                  "dropoff_address",
                  "dropoff_city",
                  "dropoff_postal_code",
                  "dropoff_date",
                  "dropoff_time",
                  "customer_name",
                  "customer_phone",
                  "customer_email",
                  "notes"
                ]
              }
            }
          },
          required: ["orders"]
        }
      });

      const ordersArray = Array.isArray(result)
        ? result
        : Array.isArray(result?.orders)
        ? result.orders
        : [result];
      const normalized = ordersArray
        .filter(Boolean)
        .map((item) => ({
          ...normalizeExtractedData(item),
          order_number: '',
          status: 'new'
        }));

      if (!normalized.length) {
        setError('Keine Aufträge im Text erkannt.');
        setExtractedOrders([]);
        return;
      }

      setExtractedOrders(normalized);
      setSelectedOrderIndex(0);
    } catch (err) {
      setError(err?.message || 'Fehler bei der Analyse. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentOrder) return;
    if (!currentOrder.pickup_postal_code || !currentOrder.dropoff_postal_code) {
      setError('Bitte Abhol- und Ziel-PLZ ausfuellen.');
      return;
    }
    let distanceKm = currentOrder.distance_km ? parseFloat(currentOrder.distance_km) : null;

    try {
      if (distanceKm === null) {
        distanceKm = await getMapboxDistanceKm({
          pickupAddress: currentOrder.pickup_address,
          pickupCity: currentOrder.pickup_city,
          pickupPostalCode: currentOrder.pickup_postal_code,
          dropoffAddress: currentOrder.dropoff_address,
          dropoffCity: currentOrder.dropoff_city,
          dropoffPostalCode: currentOrder.dropoff_postal_code,
        });
      }
      if (distanceKm === null) {
        setError('Entfernung konnte nicht berechnet werden.');
        return;
      }
    } catch (err) {
      setError(err?.message || 'Entfernung konnte nicht berechnet werden.');
      return;
    }

    const { _customerResolved, _customerMatchType, ...orderPayload } = currentOrder || {};
    const resolvedCustomer = !orderPayload.customer_id
      ? resolveCustomerMatch(orderPayload.customer_name)
      : null;
    const dataToSave = {
      ...orderPayload,
      customer_id: orderPayload.customer_id || resolvedCustomer?.id || null,
      customer_name: resolvedCustomer?.name || orderPayload.customer_name || '',
      customer_email: orderPayload.customer_email || resolvedCustomer?.email || '',
      customer_phone: orderPayload.customer_phone || resolvedCustomer?.phone || '',
      distance_km: distanceKm,
      driver_price: (() => {
        if (currentOrder.driver_price === '' || currentOrder.driver_price === null || currentOrder.driver_price === undefined) {
          return null;
        }
        const parsed = parseFloat(currentOrder.driver_price);
        return Number.isFinite(parsed) ? parsed : null;
      })(),
    };

    const created = await createOrderMutation.mutateAsync(dataToSave);
    if (created?.id) {
      try {
        await appClient.notifications.sendCustomerConfirmation({ orderId: created.id });
      } catch (err) {
        console.warn('Kundenbestaetigung fehlgeschlagen', err);
      }
    }
    const nextOrders = extractedOrders.filter((_, index) => index !== selectedOrderIndex);
    setExtractedOrders(nextOrders);
    if (!nextOrders.length) {
      setImportSuccess(true);
      setSelectedOrderIndex(0);
      window.location.href = createPageUrl('Orders');
      return;
    }
    setSelectedOrderIndex(Math.min(selectedOrderIndex, nextOrders.length - 1));
  };

  const handleCancel = () => {
    setExtractedOrders([]);
    setSelectedOrderIndex(0);
    setEmailText('');
    setImportSuccess(false);
  };

  const updateExtractedData = (field, value) => {
    setExtractedOrders(prev => {
      const updated = [...prev];
      updated[selectedOrderIndex] = { ...updated[selectedOrderIndex], [field]: value };
      return updated;
    });
  };

  const updateCurrentOrder = (updates) => {
    setExtractedOrders((prev) => {
      const updated = [...prev];
      updated[selectedOrderIndex] = { ...updated[selectedOrderIndex], ...updates };
      return updated;
    });
  };

  const handleDriverChange = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    if (driver) {
      updateExtractedData('assigned_driver_id', driver.id);
      updateExtractedData('assigned_driver_name', `${driver.first_name} ${driver.last_name}`);
    }
  };

  const handleCustomerNameChange = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      updateCurrentOrder({
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        _customerResolved: true,
        _customerMatchType: 'manual',
      });
      return;
    }
    const match = resolveCustomerMatch(trimmed);
    if (match) {
      updateCurrentOrder({
        customer_id: match.id,
        customer_name: match.name,
        customer_phone: match.phone || '',
        customer_email: match.email || '',
        _customerResolved: true,
        _customerMatchType: 'manual',
      });
      setCustomerEditOpen((prev) => ({ ...prev, [selectedOrderIndex]: false }));
      return;
    }
    updateCurrentOrder({
      customer_id: '',
      customer_name: value,
      _customerResolved: true,
      _customerMatchType: 'manual',
    });
  };

  const removeOrder = (index) => {
    const nextOrders = extractedOrders.filter((_, idx) => idx !== index);
    setExtractedOrders(nextOrders);
    if (!nextOrders.length) {
      setImportSuccess(false);
      setSelectedOrderIndex(0);
      return;
    }
    setSelectedOrderIndex(Math.min(index, nextOrders.length - 1));
  };

  const currentOrder = extractedOrders[selectedOrderIndex];
  const activeCustomerOption = useMemo(() => {
    if (!currentOrder?.customer_id) return null;
    return customerOptions.find((option) => option.id === currentOrder.customer_id) || null;
  }, [currentOrder, customerOptions]);
  const isCustomerLinked = Boolean(activeCustomerOption);
  const showCustomerPicker = !isCustomerLinked || customerEditOpen[selectedOrderIndex];
  const distanceKey = useMemo(() => {
    if (!currentOrder) return '';
    const pickupKey = [currentOrder.pickup_address, currentOrder.pickup_postal_code, currentOrder.pickup_city]
      .filter(Boolean)
      .join('|');
    const dropoffKey = [currentOrder.dropoff_address, currentOrder.dropoff_postal_code, currentOrder.dropoff_city]
      .filter(Boolean)
      .join('|');
    return `${selectedOrderIndex}::${currentOrder.customer_id || ''}::${pickupKey}::${dropoffKey}`;
  }, [
    selectedOrderIndex,
    currentOrder?.customer_id,
    currentOrder?.pickup_address,
    currentOrder?.pickup_postal_code,
    currentOrder?.pickup_city,
    currentOrder?.dropoff_address,
    currentOrder?.dropoff_postal_code,
    currentOrder?.dropoff_city,
  ]);

  const computeDistance = async () => {
    const order = extractedOrders[selectedOrderIndex];
    if (!order || !order.pickup_address || !order.dropoff_address) {
      setCalcError('');
      return;
    }
    setCalcLoading(true);
    setCalcError('');
    try {
      const distanceKm = await getMapboxDistanceKm({
        pickupAddress: order.pickup_address,
        pickupCity: order.pickup_city,
        pickupPostalCode: order.pickup_postal_code,
        dropoffAddress: order.dropoff_address,
        dropoffCity: order.dropoff_city,
        dropoffPostalCode: order.dropoff_postal_code,
      });
      if (distanceKm === null) {
        setCalcError('Entfernung konnte nicht berechnet werden.');
        return;
      }
      updateExtractedData('distance_km', formatKm(distanceKm));
    } catch (err) {
      setCalcError(err?.message || 'Entfernung konnte nicht berechnet werden.');
    } finally {
      setCalcLoading(false);
    }
  };

  useEffect(() => {
    if (!currentOrder) return;
    if (!currentOrder.pickup_address || !currentOrder.dropoff_address) {
      setCalcError('');
      return;
    }
    if (distanceKey === lastCalcKeyRef.current) return;
    lastCalcKeyRef.current = distanceKey;
    computeDistance();
  }, [distanceKey, currentOrder]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost"
          onClick={() => window.location.href = createPageUrl('Orders')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Import</h1>
          <p className="text-gray-500">E-Mail einfügen und automatisch Auftrag erstellen</p>
        </div>
      </div>

      {!extractedOrders.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Text einfügen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Text für den Import</Label>
              <Textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Füge hier den Text mit einem oder mehreren Aufträgen ein..."
                rows={15}
                className="font-mono text-sm"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            <Button 
              onClick={analyzeEmail}
              disabled={analyzing || !emailText.trim()}
              className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Mit AI analysieren
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {importSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Import abgeschlossen</p>
                <p className="text-sm text-green-700">Alle Aufträge wurden gespeichert.</p>
              </div>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Gefundene Aufträge ({extractedOrders.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {extractedOrders.map((order, index) => (
                  <button
                    key={`${order.order_number}-${index}`}
                    type="button"
                    onClick={() => setSelectedOrderIndex(index)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                      index === selectedOrderIndex
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {order.order_number || `Auftrag ${index + 1}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {order.pickup_city || 'Start'} → {order.dropoff_city || 'Ziel'}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>

            {currentOrder && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Auftragsinformationen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Auftragsnummer (intern)</Label>
                        <Input
                          value={currentOrder.order_number || ''}
                          onChange={(e) => updateExtractedData('order_number', e.target.value)}
                          placeholder="Wird automatisch vergeben"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Leer lassen für automatische Vergabe (AVO-YYYY-xxxxx).
                        </p>
                      </div>
                      <div>
                        <Label>Auftragsnummer (Kunde)</Label>
                        <Input
                          value={currentOrder.customer_order_number || ''}
                          onChange={(e) => updateExtractedData('customer_order_number', e.target.value)}
                          placeholder="z. B. Kunden-Ref. / Bestellnummer"
                        />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select 
                          value={currentOrder.status || 'new'} 
                          onValueChange={(value) => updateExtractedData('status', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Neu</SelectItem>
                            <SelectItem value="assigned">Zugewiesen</SelectItem>
                            <SelectItem value="accepted">Angenommen</SelectItem>
                            <SelectItem value="pickup_started">Übernahme</SelectItem>
                            <SelectItem value="in_transit">Bearbeitung</SelectItem>
                            <SelectItem value="delivery_started">Übergabe</SelectItem>
                            <SelectItem value="completed">Fertig</SelectItem>
                            <SelectItem value="cancelled">Storniert</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Fahrzeugdaten</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Kennzeichen *</Label>
                        <Input 
                          value={currentOrder.license_plate || ''} 
                          onChange={(e) => updateExtractedData('license_plate', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>FIN</Label>
                        <Input 
                          value={currentOrder.vin || ''} 
                          onChange={(e) => updateExtractedData('vin', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Marke</Label>
                        <Input 
                          value={currentOrder.vehicle_brand || ''} 
                          onChange={(e) => updateExtractedData('vehicle_brand', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Modell</Label>
                        <Input 
                          value={currentOrder.vehicle_model || ''} 
                          onChange={(e) => updateExtractedData('vehicle_model', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Farbe</Label>
                        <Input 
                          value={currentOrder.vehicle_color || ''} 
                          onChange={(e) => updateExtractedData('vehicle_color', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Abholung</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Abholadresse *</Label>
                        <AddressAutocomplete
                          value={currentOrder.pickup_address || ''}
                          onChange={(value) => updateExtractedData('pickup_address', value)}
                          onSelect={({ address, city, postalCode }) => {
                            updateExtractedData('pickup_address', address);
                            if (city) updateExtractedData('pickup_city', city);
                            if (postalCode) updateExtractedData('pickup_postal_code', postalCode);
                          }}
                          placeholder="Straße, Hausnummer"
                        />
                      </div>
                      <div>
                        <Label>Abholort *</Label>
                        <Input 
                          value={currentOrder.pickup_city || ''} 
                          onChange={(e) => updateExtractedData('pickup_city', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>PLZ Abholung *</Label>
                        <Input 
                          value={currentOrder.pickup_postal_code || ''} 
                          onChange={(e) => updateExtractedData('pickup_postal_code', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Abholdatum</Label>
                        <Input 
                          type="date"
                          value={currentOrder.pickup_date || ''} 
                          onChange={(e) => updateExtractedData('pickup_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Abholzeit</Label>
                        <Input 
                          type="time"
                          value={currentOrder.pickup_time || ''} 
                          onChange={(e) => updateExtractedData('pickup_time', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Abgabe</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Zieladresse *</Label>
                        <AddressAutocomplete
                          value={currentOrder.dropoff_address || ''}
                          onChange={(value) => updateExtractedData('dropoff_address', value)}
                          onSelect={({ address, city, postalCode }) => {
                            updateExtractedData('dropoff_address', address);
                            if (city) updateExtractedData('dropoff_city', city);
                            if (postalCode) updateExtractedData('dropoff_postal_code', postalCode);
                          }}
                          placeholder="Straße, Hausnummer"
                        />
                      </div>
                      <div>
                        <Label>Zielort *</Label>
                        <Input 
                          value={currentOrder.dropoff_city || ''} 
                          onChange={(e) => updateExtractedData('dropoff_city', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>PLZ Ziel *</Label>
                        <Input 
                          value={currentOrder.dropoff_postal_code || ''} 
                          onChange={(e) => updateExtractedData('dropoff_postal_code', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Lieferdatum</Label>
                        <Input 
                          type="date"
                          value={currentOrder.dropoff_date || ''} 
                          onChange={(e) => updateExtractedData('dropoff_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Lieferzeit</Label>
                        <Input 
                          type="time"
                          value={currentOrder.dropoff_time || ''} 
                          onChange={(e) => updateExtractedData('dropoff_time', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Kunde & Fahrer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {isCustomerLinked && !showCustomerPicker ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold">
                                {currentOrder?._customerMatchType === 'auto'
                                  ? 'Kunde automatisch zugeordnet'
                                  : 'Kunde zugeordnet'}
                              </p>
                              <p className="text-xs text-emerald-700">
                                {activeCustomerOption?.label || activeCustomerOption?.name}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setCustomerEditOpen((prev) => ({
                                  ...prev,
                                  [selectedOrderIndex]: true,
                                }))
                              }
                            >
                              Ändern
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label>{isCustomerLinked ? 'Kunde ändern' : 'Neuer Kunde'}</Label>
                          <Input
                            list="import-customer-options"
                            value={currentOrder.customer_name || ""}
                            onChange={(e) => handleCustomerNameChange(e.target.value)}
                            placeholder="Kunde eingeben oder auswählen..."
                          />
                          <datalist id="import-customer-options">
                            {customerOptions.map((option) => (
                              <option key={option.id} value={option.label} />
                            ))}
                          </datalist>
                          {!isCustomerLinked && (
                            <p className="mt-1 text-xs text-amber-600">
                              Kein bestehender Kunde erkannt. Bitte auswählen oder neuen Namen eingeben.
                            </p>
                          )}
                        </div>
                      )}
                      <div>
                        <Label>Fahrer zuweisen</Label>
                        <Select
                          value={currentOrder.assigned_driver_id || "none"}
                          onValueChange={(value) => handleDriverChange(value === "none" ? "" : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Fahrer wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Kein Fahrer</SelectItem>
                            {drivers.filter(d => d.status === 'active').map(driver => (
                              <SelectItem key={driver.id} value={driver.id}>
                                {driver.first_name} {driver.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Kundentelefon</Label>
                        <Input 
                          value={currentOrder.customer_phone || ''} 
                          onChange={(e) => updateExtractedData('customer_phone', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Kunden E-Mail</Label>
                        <Input 
                          type="email"
                          value={currentOrder.customer_email || ''} 
                          onChange={(e) => updateExtractedData('customer_email', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Strecke (km)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={currentOrder.distance_km || ''}
                            readOnly
                            placeholder="wird berechnet"
                            className="bg-slate-100 text-slate-600"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => {
                              computeDistance();
                            }}
                            disabled={!currentOrder.pickup_address || !currentOrder.dropoff_address || calcLoading}
                          >
                            Strecke berechnen
                          </Button>
                        </div>
                        {calcError && (
                          <p className="mt-1 text-xs text-red-600">{calcError}</p>
                        )}
                        {calcLoading && (
                          <p className="mt-1 text-xs text-slate-500">Strecke wird berechnet…</p>
                        )}
                      </div>
                      <div>
                        <Label>Fahrerpreis (EUR)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={currentOrder.driver_price || ''}
                          onChange={(e) => updateExtractedData('driver_price', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Hinweise</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea 
                      value={currentOrder.notes || ''} 
                      onChange={(e) => updateExtractedData('notes', e.target.value)}
                      rows={4}
                      placeholder="Besondere Hinweise..."
                    />
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3 justify-end">
                  <Button 
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => removeOrder(selectedOrderIndex)}
                  >
                    Auftrag löschen
                  </Button>
                  <Button 
                    onClick={handleConfirm}
                    disabled={createOrderMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {createOrderMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Erstelle...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Auftrag bestätigen & speichern
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
