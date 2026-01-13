import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import StatusBadge from "@/components/ui/StatusBadge";
import { getMapboxDistanceKm } from "@/utils/mapboxDistance";
import { 
  Car, 
  MapPin, 
  Calendar, 
  User, 
  Save,
  X,
  Loader2
} from 'lucide-react';

const Section = ({ title, icon: Icon, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 text-[#1e3a5f]">
      <Icon className="w-5 h-5" />
      <h3 className="font-semibold">{title}</h3>
    </div>
    {children}
  </div>
);

const formatKm = (value) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

export default function OrderForm({ order, onSave, onCancel, currentUser }) {
  const [formData, setFormData] = useState({
    order_number: '',
    customer_order_number: '',
    status: 'new',
    customer_id: '',
    license_plate: '',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_color: '',
    vin: '',
    pickup_address: '',
    pickup_city: '',
    pickup_postal_code: '',
    pickup_date: '',
    pickup_time: '',
    dropoff_address: '',
    dropoff_city: '',
    dropoff_postal_code: '',
    dropoff_date: '',
    dropoff_time: '',
    assigned_driver_id: '',
    assigned_driver_name: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    notes: '',
    distance_km: '',
  });

  const [saving, setSaving] = useState(false);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState('');
  const [distanceRecalcToken, setDistanceRecalcToken] = useState(0);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.filter({ status: 'active' }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.filter({ status: 'active' }),
  });

  useEffect(() => {
    if (order) {
      setFormData({
        ...order,
        distance_km: formatKm(order.distance_km),
      });
    } else {
      setFormData(prev => ({
        ...prev,
        order_number: '',
      }));
    }
  }, [order]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRecalculateDistance = () => {
    setDistanceRecalcToken((prev) => prev + 1);
  };

  const handleDriverChange = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    const driverName = driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : '';
    setFormData(prev => ({
      ...prev,
      assigned_driver_id: driverId,
      assigned_driver_name: driverName,
      status: driverId && prev.status === 'new' ? 'assigned' : prev.status,
    }));
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    let customerName = '';
    if (customer) {
      customerName = customer.type === 'business' && customer.company_name 
        ? customer.company_name 
        : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    }
    
    setFormData(prev => ({
      ...prev,
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customer?.email || '',
      customer_phone: customer?.phone || '',
    }));
  };

  const distanceKey = useMemo(() => {
    const pickupKey = [formData.pickup_address, formData.pickup_postal_code, formData.pickup_city]
      .filter(Boolean)
      .join('|');
    const dropoffKey = [formData.dropoff_address, formData.dropoff_postal_code, formData.dropoff_city]
      .filter(Boolean)
      .join('|');
    return `${pickupKey}::${dropoffKey}::${distanceRecalcToken}`;
  }, [
    formData.pickup_address,
    formData.pickup_postal_code,
    formData.pickup_city,
    formData.dropoff_address,
    formData.dropoff_postal_code,
    formData.dropoff_city,
    distanceRecalcToken,
  ]);

  useEffect(() => {
    const shouldCompute =
      formData.pickup_address &&
      formData.dropoff_address;
    if (!shouldCompute) {
      setDistanceError('');
      return;
    }

    let active = true;
    const run = async () => {
      setDistanceLoading(true);
      setDistanceError('');
      try {
        const distance = await getMapboxDistanceKm({
          pickupAddress: formData.pickup_address,
          pickupCity: formData.pickup_city,
          pickupPostalCode: formData.pickup_postal_code,
          dropoffAddress: formData.dropoff_address,
          dropoffCity: formData.dropoff_city,
          dropoffPostalCode: formData.dropoff_postal_code,
        });
        if (!active) return;
        if (distance === null) {
          setDistanceError('Entfernung konnte nicht berechnet werden.');
          return;
        }
        setFormData((prev) => ({
          ...prev,
          distance_km: formatKm(distance),
        }));
      } catch (err) {
        if (!active) return;
        setDistanceError(err?.message || 'Entfernung konnte nicht berechnet werden.');
      } finally {
        if (active) setDistanceLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [distanceKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        distance_km: formData.distance_km ? parseFloat(formData.distance_km) : null,
      };
      await onSave(dataToSave);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle>{order ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Speichern
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {/* Order Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Auftragsnummer (intern)</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleChange('order_number', e.target.value)}
                placeholder={order ? '' : 'Wird automatisch vergeben'}
                readOnly={!order}
              />
              {!order && (
                <p className="mt-1 text-xs text-gray-500">
                  Wird beim Speichern automatisch vergeben (z. B. AVO-2025-00001).
                </p>
              )}
            </div>
            <div>
              <Label>Auftragsnummer (Kunde)</Label>
              <Input
                value={formData.customer_order_number}
                onChange={(e) => handleChange('customer_order_number', e.target.value)}
                placeholder="Kunden-Referenz"
              />
            </div>
            <div>
              <Label>Status</Label>
              <div className="mt-2 flex flex-col gap-1">
                <StatusBadge status={formData.status || 'new'} />
                <p className="text-xs text-gray-500">Status wird automatisch im Workflow gesetzt.</p>
              </div>
            </div>
            <div>
                <Label>Kunde</Label>
                <Select 
                value={formData.customer_id || "none"} 
                onValueChange={(v) => handleCustomerChange(v === "none" ? "" : v)}
                >
                <SelectTrigger>
                  <SelectValue placeholder="Kunde auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Kunde</SelectItem>
                  {customers.map(customer => {
                    const name = customer.type === 'business' && customer.company_name
                      ? customer.company_name
                      : `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
                    return (
                      <SelectItem key={customer.id} value={customer.id}>
                        {name} ({customer.customer_number})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
                </Select>
                </div>
            <div>
              <Label>Strecke (km)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={formData.distance_km}
                  readOnly
                  placeholder="wird berechnet"
                  className="bg-slate-100 text-slate-600"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleRecalculateDistance}
                  disabled={!formData.pickup_address || !formData.dropoff_address || distanceLoading}
                >
                  Strecke berechnen
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Wird automatisch aus Abhol- und Abgabeadresse berechnet.
              </p>
              {distanceError && (
                <p className="mt-1 text-xs text-red-600">{distanceError}</p>
              )}
            </div>
          </div>
          {distanceLoading && (
            <p className="text-xs text-slate-500">Strecke wird berechnet…</p>
          )}

          <Separator />

          {/* Vehicle Info */}
          <Section title="Fahrzeug" icon={Car}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Kennzeichen *</Label>
                <Input 
                  value={formData.license_plate}
                  onChange={(e) => handleChange('license_plate', e.target.value.toUpperCase())}
                  placeholder="B-AB 1234"
                  required
                />
              </div>
              <div>
                <Label>Marke</Label>
                <Input 
                  value={formData.vehicle_brand}
                  onChange={(e) => handleChange('vehicle_brand', e.target.value)}
                  placeholder="z.B. BMW"
                />
              </div>
              <div>
                <Label>Modell</Label>
                <Input 
                  value={formData.vehicle_model}
                  onChange={(e) => handleChange('vehicle_model', e.target.value)}
                  placeholder="z.B. 320i"
                />
              </div>
              <div>
                <Label>Farbe</Label>
                <Input 
                  value={formData.vehicle_color}
                  onChange={(e) => handleChange('vehicle_color', e.target.value)}
                  placeholder="z.B. Schwarz"
                />
              </div>
            </div>
            <div>
              <Label>VIN / Fahrgestellnummer</Label>
              <Input 
                value={formData.vin}
                onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
                placeholder="WVWZZZ..."
              />
            </div>
          </Section>

          <Separator />

          {/* Pickup */}
          <Section title="Abholung" icon={MapPin}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Adresse *</Label>
                <AddressAutocomplete
                  value={formData.pickup_address}
                  onChange={(value) => handleChange('pickup_address', value)}
                  onSelect={({ address, city, postalCode }) => {
                    handleChange('pickup_address', address);
                    if (city) handleChange('pickup_city', city);
                    if (postalCode) handleChange('pickup_postal_code', postalCode);
                  }}
                  placeholder="Straße, Hausnummer"
                  required
                />
              </div>
              <div>
                <Label>Stadt *</Label>
                <Input 
                  value={formData.pickup_city}
                  onChange={(e) => handleChange('pickup_city', e.target.value)}
                  placeholder="Stadt"
                  required
                />
              </div>
              <div>
                <Label>PLZ *</Label>
                <Input 
                  value={formData.pickup_postal_code}
                  onChange={(e) => handleChange('pickup_postal_code', e.target.value)}
                  placeholder="Postleitzahl"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Datum</Label>
                  <Input 
                    type="date"
                    value={formData.pickup_date}
                    onChange={(e) => handleChange('pickup_date', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Uhrzeit</Label>
                  <Input 
                    type="time"
                    value={formData.pickup_time}
                    onChange={(e) => handleChange('pickup_time', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Separator />

          {/* Dropoff */}
          <Section title="Abgabe" icon={MapPin}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Adresse *</Label>
                <AddressAutocomplete
                  value={formData.dropoff_address}
                  onChange={(value) => handleChange('dropoff_address', value)}
                  onSelect={({ address, city, postalCode }) => {
                    handleChange('dropoff_address', address);
                    if (city) handleChange('dropoff_city', city);
                    if (postalCode) handleChange('dropoff_postal_code', postalCode);
                  }}
                  placeholder="Straße, Hausnummer"
                  required
                />
              </div>
              <div>
                <Label>Stadt *</Label>
                <Input 
                  value={formData.dropoff_city}
                  onChange={(e) => handleChange('dropoff_city', e.target.value)}
                  placeholder="Stadt"
                  required
                />
              </div>
              <div>
                <Label>PLZ *</Label>
                <Input 
                  value={formData.dropoff_postal_code}
                  onChange={(e) => handleChange('dropoff_postal_code', e.target.value)}
                  placeholder="Postleitzahl"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Datum</Label>
                  <Input 
                    type="date"
                    value={formData.dropoff_date}
                    onChange={(e) => handleChange('dropoff_date', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Uhrzeit</Label>
                  <Input 
                    type="time"
                    value={formData.dropoff_time}
                    onChange={(e) => handleChange('dropoff_time', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Section>

          <Separator />

          {/* Driver & Customer */}
          <Section title="Fahrer & Kunde" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Fahrer zuweisen</Label>
                <Select 
                  value={formData.assigned_driver_id || "none"} 
                  onValueChange={(v) => handleDriverChange(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Fahrer auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Fahrer</SelectItem>
                    {drivers.map(driver => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {`${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Unbekannt'} ({driver.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Kundenname</Label>
                  <Input 
                    value={formData.customer_name}
                    onChange={(e) => handleChange('customer_name', e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Telefon</Label>
                    <Input 
                      value={formData.customer_phone}
                      onChange={(e) => handleChange('customer_phone', e.target.value)}
                      placeholder="+49..."
                    />
                  </div>
                  <div>
                    <Label>E-Mail</Label>
                    <Input 
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => handleChange('customer_email', e.target.value)}
                      placeholder="email@..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Separator />

          {/* Notes */}
          <div>
            <Label>Bemerkungen</Label>
            <Textarea 
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Besondere Hinweise, Anweisungen..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
