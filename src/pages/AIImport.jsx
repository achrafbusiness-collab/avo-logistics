import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list(),
  });

  const createOrderMutation = useMutation({
    mutationFn: (data) => appClient.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      window.location.href = createPageUrl('Orders');
    },
  });

  const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `EU-OA-${year}${month}-${random}`;
  };

  const normalizeExtractedData = (data) => ({
    license_plate: data?.license_plate || '',
    vehicle_brand: data?.vehicle_brand || '',
    vehicle_model: data?.vehicle_model || '',
    vehicle_color: data?.vehicle_color || '',
    vin: data?.vin || '',
    pickup_address: data?.pickup_address || '',
    pickup_city: data?.pickup_city || '',
    pickup_date: data?.pickup_date || '',
    pickup_time: data?.pickup_time || '',
    dropoff_address: data?.dropoff_address || '',
    dropoff_city: data?.dropoff_city || '',
    dropoff_date: data?.dropoff_date || '',
    dropoff_time: data?.dropoff_time || '',
    customer_name: data?.customer_name || '',
    customer_phone: data?.customer_phone || '',
    customer_email: data?.customer_email || '',
    notes: data?.notes || '',
    price: data?.price ?? '',
  });

  const analyzeEmail = async () => {
    if (!emailText.trim()) {
      setError('Bitte E-Mail-Text eingeben');
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Analysiere diese E-Mail (Deutsch) und extrahiere alle Auftragsinformationen für eine Fahrzeugüberführung.

E-Mail:
${emailText}

Extrahiere diese Felder. Wenn ein Feld nicht gefunden wird, gib "" (leerer String) zurück. Preis darf eine Zahl oder "" sein:
- license_plate (Kennzeichen)
- vehicle_brand (Marke)
- vehicle_model (Modell)
- vehicle_color (Farbe)
- vin (FIN/VIN/Fahrzeugnummer)
- pickup_address (Abholadresse vollständig)
- pickup_city (Abholort/Stadt)
- pickup_date (YYYY-MM-DD)
- pickup_time (HH:MM)
- dropoff_address (Lieferadresse vollständig)
- dropoff_city (Zielort/Stadt)
- dropoff_date (YYYY-MM-DD)
- dropoff_time (HH:MM)
- customer_name
- customer_phone
- customer_email
- notes (Besondere Hinweise)
- price (nur Zahl, sonst "")

Gib ausschließlich die strukturierten Daten zurück.`,
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            license_plate: { type: ["string", "null"] },
            vehicle_brand: { type: ["string", "null"] },
            vehicle_model: { type: ["string", "null"] },
            vehicle_color: { type: ["string", "null"] },
            vin: { type: ["string", "null"] },
            pickup_address: { type: ["string", "null"] },
            pickup_city: { type: ["string", "null"] },
            pickup_date: { type: ["string", "null"] },
            pickup_time: { type: ["string", "null"] },
            dropoff_address: { type: ["string", "null"] },
            dropoff_city: { type: ["string", "null"] },
            dropoff_date: { type: ["string", "null"] },
            dropoff_time: { type: ["string", "null"] },
            customer_name: { type: ["string", "null"] },
            customer_phone: { type: ["string", "null"] },
            customer_email: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            price: { type: ["number", "null"] }
          },
          required: [
            "license_plate",
            "vehicle_brand",
            "vehicle_model",
            "vehicle_color",
            "vin",
            "pickup_address",
            "pickup_city",
            "pickup_date",
            "pickup_time",
            "dropoff_address",
            "dropoff_city",
            "dropoff_date",
            "dropoff_time",
            "customer_name",
            "customer_phone",
            "customer_email",
            "notes",
            "price"
          ]
        }
      });

      setExtractedData({
        ...normalizeExtractedData(result),
        order_number: generateOrderNumber(),
        status: 'new'
      });
    } catch (err) {
      setError(err?.message || 'Fehler bei der Analyse. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    await createOrderMutation.mutateAsync(extractedData);
  };

  const handleCancel = () => {
    setExtractedData(null);
    setEmailText('');
  };

  const updateExtractedData = (field, value) => {
    setExtractedData({ ...extractedData, [field]: value });
  };

  const handleDriverChange = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    if (driver) {
      updateExtractedData('assigned_driver_id', driver.id);
      updateExtractedData('assigned_driver_name', `${driver.first_name} ${driver.last_name}`);
    }
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      updateExtractedData('customer_id', customer.id);
      updateExtractedData('customer_name', customer.company_name || `${customer.first_name} ${customer.last_name}`);
      updateExtractedData('customer_phone', customer.phone);
      updateExtractedData('customer_email', customer.email);
      if (customer.base_price) {
        updateExtractedData('price', customer.base_price);
      }
    }
  };

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

      {!extractedData ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              E-Mail einfügen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>E-Mail Inhalt</Label>
              <Textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Kopiere hier den kompletten E-Mail-Text mit allen Auftragsinformationen..."
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
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Auftrag erfolgreich extrahiert</p>
              <p className="text-sm text-green-700">Bitte überprüfe die Daten und bestätige den Import</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Auftragsinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Auftragsnummer</Label>
                  <Input 
                    value={extractedData.order_number || ''} 
                    onChange={(e) => updateExtractedData('order_number', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select 
                    value={extractedData.status || 'new'} 
                    onValueChange={(value) => updateExtractedData('status', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Neu</SelectItem>
                      <SelectItem value="assigned">Zugewiesen</SelectItem>
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
                    value={extractedData.license_plate || ''} 
                    onChange={(e) => updateExtractedData('license_plate', e.target.value)}
                  />
                </div>
                <div>
                  <Label>FIN</Label>
                  <Input 
                    value={extractedData.vin || ''} 
                    onChange={(e) => updateExtractedData('vin', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Marke</Label>
                  <Input 
                    value={extractedData.vehicle_brand || ''} 
                    onChange={(e) => updateExtractedData('vehicle_brand', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Modell</Label>
                  <Input 
                    value={extractedData.vehicle_model || ''} 
                    onChange={(e) => updateExtractedData('vehicle_model', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Farbe</Label>
                  <Input 
                    value={extractedData.vehicle_color || ''} 
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
                  <Input 
                    value={extractedData.pickup_address || ''} 
                    onChange={(e) => updateExtractedData('pickup_address', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Abholort</Label>
                  <Input 
                    value={extractedData.pickup_city || ''} 
                    onChange={(e) => updateExtractedData('pickup_city', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Abholdatum</Label>
                  <Input 
                    type="date"
                    value={extractedData.pickup_date || ''} 
                    onChange={(e) => updateExtractedData('pickup_date', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Abholzeit</Label>
                  <Input 
                    type="time"
                    value={extractedData.pickup_time || ''} 
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
                  <Input 
                    value={extractedData.dropoff_address || ''} 
                    onChange={(e) => updateExtractedData('dropoff_address', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Zielort</Label>
                  <Input 
                    value={extractedData.dropoff_city || ''} 
                    onChange={(e) => updateExtractedData('dropoff_city', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Lieferdatum</Label>
                  <Input 
                    type="date"
                    value={extractedData.dropoff_date || ''} 
                    onChange={(e) => updateExtractedData('dropoff_date', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Lieferzeit</Label>
                  <Input 
                    type="time"
                    value={extractedData.dropoff_time || ''} 
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
                <div>
                  <Label>Kunde auswählen</Label>
                  <Select onValueChange={handleCustomerChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kunde wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.company_name || `${customer.first_name} ${customer.last_name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fahrer zuweisen</Label>
                  <Select onValueChange={handleDriverChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Fahrer wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.filter(d => d.status === 'active').map(driver => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.first_name} {driver.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kundenname</Label>
                  <Input 
                    value={extractedData.customer_name || ''} 
                    onChange={(e) => updateExtractedData('customer_name', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Kundentelefon</Label>
                  <Input 
                    value={extractedData.customer_phone || ''} 
                    onChange={(e) => updateExtractedData('customer_phone', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Kunden E-Mail</Label>
                  <Input 
                    type="email"
                    value={extractedData.customer_email || ''} 
                    onChange={(e) => updateExtractedData('customer_email', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Preis (€)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={extractedData.price || ''} 
                    onChange={(e) => updateExtractedData('price', parseFloat(e.target.value))}
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
                value={extractedData.notes || ''} 
                onChange={(e) => updateExtractedData('notes', e.target.value)}
                rows={4}
                placeholder="Besondere Hinweise..."
              />
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button 
              variant="outline"
              onClick={handleCancel}
            >
              Abbrechen
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
                  Auftrag bestätigen & erstellen
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
