import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  Plus, 
  Search, 
  Building2,
  UserCircle,
  ArrowLeft,
  Loader2,
  Save,
  X,
  Edit,
  Trash2,
  Mail,
  Phone,
  MapPin,
  UploadCloud,
  FileText
} from 'lucide-react';

export default function Customers() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [priceTierRows, setPriceTierRows] = useState([]);
  const [priceTiersDirty, setPriceTiersDirty] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [pricingFile, setPricingFile] = useState(null);
  const [pricingFileUrl, setPricingFileUrl] = useState('');
  const [pricingUploading, setPricingUploading] = useState(false);
  const pricingFileInputRef = useRef(null);
  const priceTierSeedRef = useRef(null);
  
  const [formData, setFormData] = useState({
    customer_number: '',
    type: 'business',
    company_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'Deutschland',
    tax_id: '',
    notes: '',
    status: 'active'
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list('-created_date', 500),
  });

  const { data: customerPriceTiers = [] } = useQuery({
    queryKey: ['customer-price-tiers'],
    queryFn: () => appClient.entities.CustomerPriceTier.list('min_km', 1000),
  });

  const tiersByCustomer = useMemo(() => {
    return (customerPriceTiers || []).reduce((acc, tier) => {
      if (!tier?.customer_id) return acc;
      if (!acc[tier.customer_id]) acc[tier.customer_id] = [];
      acc[tier.customer_id].push(tier);
      return acc;
    }, {});
  }, [customerPriceTiers]);

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Customer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Customer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Customer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setView('list');
      setSelectedCustomer(null);
      setDeleteConfirmOpen(false);
    },
  });

  useEffect(() => {
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedCustomer(null);
      // Generate customer number
      const number = Math.floor(10000 + Math.random() * 90000);
      setFormData(prev => ({ ...prev, customer_number: `K-${number}` }));
    } else if (urlParams.get('id')) {
      const customer = customers.find(c => c.id === urlParams.get('id'));
      if (customer) {
        setSelectedCustomer(customer);
        setView('details');
      }
    }
  }, [urlParams.toString(), customers]);

  useEffect(() => {
    if (selectedCustomer && view === 'form') {
      setFormData({
        ...selectedCustomer,
      });
    } else if (view === 'form' && !selectedCustomer) {
      const number = Math.floor(10000 + Math.random() * 90000);
      setFormData({
        customer_number: `K-${number}`,
        type: 'business',
        company_name: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',
        country: 'Deutschland',
        tax_id: '',
        notes: '',
        status: 'active'
      });
    }
  }, [selectedCustomer, view]);

  useEffect(() => {
    if (view !== 'form') {
      setPriceTiersDirty(false);
      priceTierSeedRef.current = null;
      return;
    }

    const seedKey = selectedCustomer ? selectedCustomer.id : 'new';
    const seedChanged = priceTierSeedRef.current !== seedKey;

    if (!seedChanged && priceTiersDirty) {
      return;
    }

    priceTierSeedRef.current = seedKey;

    if (selectedCustomer) {
      const tiers = tiersByCustomer[selectedCustomer.id] || [];
      setPriceTierRows(
        tiers.length > 0
          ? tiers.map((tier) => ({
              id: tier.id,
              min_km: tier.min_km?.toString() || '',
              max_km: tier.max_km?.toString() || '',
              customer_price: tier.customer_price?.toString() || '',
              driver_price: tier.driver_price?.toString() || '',
            }))
          : [
              {
                id: `tier-${Date.now()}`,
                min_km: '',
                max_km: '',
                customer_price: '',
                driver_price: '',
              },
            ]
      );
      setPricingFileUrl(selectedCustomer.pricing_file_url || '');
      setPricingFile(null);
    } else {
      setPriceTierRows([
        {
          id: `tier-${Date.now()}`,
          min_km: '',
          max_km: '',
          customer_price: '',
          driver_price: '',
        },
      ]);
      setPricingFileUrl('');
      setPricingFile(null);
    }
    setPricingError('');
    setPriceTiersDirty(false);
  }, [selectedCustomer, tiersByCustomer, view, priceTiersDirty]);

  const addPriceTier = () => {
    setPriceTierRows((prev) => [
      ...prev,
      {
        id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        min_km: '',
        max_km: '',
        customer_price: '',
        driver_price: '',
      },
    ]);
    setPriceTiersDirty(true);
  };

  const updatePriceTier = (id, field, value) => {
    setPriceTierRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    setPriceTiersDirty(true);
  };

  const removePriceTier = (id) => {
    setPriceTierRows((prev) => prev.filter((row) => row.id !== id));
    setPriceTiersDirty(true);
  };

  const normalizePriceTiers = () => {
    const rows = priceTierRows
      .map((row) => ({
        id: row.id,
        min_km: row.min_km === '' ? null : Number(row.min_km),
        max_km: row.max_km === '' ? null : Number(row.max_km),
        customer_price: row.customer_price === '' ? null : Number(row.customer_price),
        driver_price: row.driver_price === '' ? null : Number(row.driver_price),
      }))
      .filter((row) =>
        row.min_km !== null ||
        row.max_km !== null ||
        row.customer_price !== null ||
        row.driver_price !== null
      );

    if (rows.length === 0) {
      setPricingError('Bitte mindestens eine Preisstaffel hinterlegen.');
      return null;
    }

    for (const row of rows) {
      if (!Number.isFinite(row.min_km)) {
        setPricingError('Jede Staffel braucht eine gültige Mindest-km Angabe.');
        return null;
      }
      if (row.max_km !== null && row.max_km < row.min_km) {
        setPricingError('Max-km darf nicht kleiner als Min-km sein.');
        return null;
      }
      if (!Number.isFinite(row.customer_price) || !Number.isFinite(row.driver_price)) {
        setPricingError('Bitte Kunden- und Fahrerpreis für jede Staffel angeben.');
        return null;
      }
    }

    const sorted = [...rows].sort((a, b) => a.min_km - b.min_km);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (prev.max_km === null) {
        setPricingError('Die letzte Staffel muss ein Ende haben, wenn weitere Staffeln folgen.');
        return null;
      }
      if (current.min_km <= prev.max_km) {
        setPricingError('Die Preisstaffeln dürfen sich nicht überschneiden.');
        return null;
      }
    }

    return sorted;
  };

  const handlePricingFilePick = (file) => {
    if (!file) return;
    setPricingFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setPricingError('');
    try {
      const dataToSave = {
        ...formData,
        pricing_file_url: pricingFileUrl || null,
      };

      const normalizedTiers = normalizePriceTiers();
      if (!normalizedTiers) {
        return;
      }

      let savedCustomer = null;
      if (selectedCustomer) {
        savedCustomer = await updateMutation.mutateAsync({
          id: selectedCustomer.id,
          data: dataToSave,
        });
      } else {
        savedCustomer = await createMutation.mutateAsync(dataToSave);
      }

      const customerId = savedCustomer?.id || selectedCustomer?.id;
      const companyId = savedCustomer?.company_id || selectedCustomer?.company_id;
      if (!customerId) {
        throw new Error('Kunde konnte nicht gespeichert werden.');
      }
      if (!companyId) {
        throw new Error('Company ID fehlt. Bitte erneut anmelden.');
      }

      if (pricingFile) {
        setPricingUploading(true);
        const { file_url } = await appClient.integrations.Core.UploadFile({
          file: pricingFile,
          bucket: 'documents',
          pathPrefix: `pricing/${customerId}`,
        });
        await appClient.entities.Customer.update(customerId, { pricing_file_url: file_url });
        setPricingFileUrl(file_url);
        setPricingFile(null);
      }

      const tiersToSave = normalizedTiers.map((tier) => ({
        customer_id: customerId,
        min_km: tier.min_km,
        max_km: tier.max_km,
        customer_price: tier.customer_price,
        driver_price: tier.driver_price,
        company_id: companyId,
      }));

      const { error: deleteError } = await supabase
        .from('customer_price_tiers')
        .delete()
        .eq('customer_id', customerId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (tiersToSave.length > 0) {
        const { error: insertError } = await supabase
          .from('customer_price_tiers')
          .insert(tiersToSave);
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['customer-price-tiers'] });
      setView('list');
      setSelectedCustomer(null);
    } catch (err) {
      setPricingError(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setPricingUploading(false);
      setSaving(false);
    }
  };

  const getCustomerName = (customer) => {
    if (customer.type === 'business' && customer.company_name) {
      return customer.company_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unbekannt';
  };

  const filteredCustomers = customers.filter(customer => {
    const name = getCustomerName(customer);
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           customer.customer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           customer.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getTierCount = (customerId) => tiersByCustomer[customerId]?.length || 0;

  // Form View
  if (view === 'form') {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedCustomer(null);
            window.history.pushState({}, '', createPageUrl('Customers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>{selectedCustomer ? 'Kunde bearbeiten' : 'Neuer Kunde'}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setView('list')}>
                  <X className="w-4 h-4 mr-2" />
                  Abbrechen
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Speichern
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Kundennummer *</Label>
                  <Input 
                    value={formData.customer_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_number: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Kundentyp</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Gewerbekunde</SelectItem>
                      <SelectItem value="private">Privatkunde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="inactive">Inaktiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {formData.type === 'business' && (
                <div>
                  <Label>Firmenname *</Label>
                  <Input 
                    value={formData.company_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Firma GmbH"
                    required={formData.type === 'business'}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Vorname</Label>
                  <Input 
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Nachname</Label>
                  <Input 
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input 
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold">Adresse</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Straße</Label>
                    <AddressAutocomplete
                      value={formData.address}
                      onChange={(value) => setFormData(prev => ({ ...prev, address: value }))}
                      onSelect={({ address, city, postalCode }) => {
                        setFormData(prev => ({
                          ...prev,
                          address,
                          city: city || prev.city,
                          postal_code: postalCode || prev.postal_code,
                        }));
                      }}
                      placeholder="Straße, Hausnummer"
                    />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input 
                      value={formData.postal_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Stadt</Label>
                    <Input 
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Land</Label>
                    <Input 
                      value={formData.country}
                      onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {formData.type === 'business' && (
                <>
                  <Separator />
                  <div>
                    <Label>Steuernummer / USt-ID</Label>
                    <Input 
                      value={formData.tax_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold">Preisstaffeln (fix pro Auftrag)</h3>
                  <Button type="button" variant="outline" onClick={addPriceTier}>
                    <Plus className="w-4 h-4 mr-2" />
                    Staffel hinzufügen
                  </Button>
                </div>
                <div className="space-y-3">
                  {priceTierRows.map((tier) => (
                    <div
                      key={tier.id}
                      className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end"
                    >
                      <div className="md:col-span-2">
                        <Label>Min. km</Label>
                        <Input
                          type="number"
                          value={tier.min_km}
                          onChange={(e) => updatePriceTier(tier.id, 'min_km', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Max. km</Label>
                        <Input
                          type="number"
                          value={tier.max_km}
                          onChange={(e) => updatePriceTier(tier.id, 'max_km', e.target.value)}
                          placeholder="Offen"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label>Kundenpreis (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tier.customer_price}
                          onChange={(e) =>
                            updatePriceTier(tier.id, 'customer_price', e.target.value)
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label>Fahrerpreis (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tier.driver_price}
                          onChange={(e) =>
                            updatePriceTier(tier.id, 'driver_price', e.target.value)
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => removePriceTier(tier.id)}
                          disabled={priceTierRows.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {pricingError && <p className="text-sm text-red-600">{pricingError}</p>}
                <p className="text-xs text-gray-500">
                  Preise werden als fixer Betrag pro Auftrag je Kilometer-Staffel gespeichert.
                </p>
                <div className="space-y-2">
                  <Label>Preisliste Datei (optional)</Label>
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handlePricingFilePick(e.dataTransfer.files?.[0]);
                    }}
                  >
                    <UploadCloud className="w-6 h-6 text-gray-400" />
                    <div className="text-sm text-gray-600">
                      Datei hierher ziehen oder
                      <Button
                        type="button"
                        variant="link"
                        className="px-1 text-[#1e3a5f]"
                        onClick={() => pricingFileInputRef.current?.click()}
                        disabled={pricingUploading}
                      >
                        auswählen
                      </Button>
                    </div>
                    <input
                      ref={pricingFileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.docx"
                      className="hidden"
                      onChange={(e) => handlePricingFilePick(e.target.files?.[0])}
                    />
                    {pricingFile && (
                      <p className="text-xs text-gray-600">
                        Ausgewählt: {pricingFile.name}
                      </p>
                    )}
                    {!pricingFile && pricingFileUrl && (
                      <a
                        href={pricingFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#1e3a5f] underline flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        Aktuelle Preisliste öffnen
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Label>Notizen</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    );
  }

  // Details View
  if (view === 'details' && selectedCustomer) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedCustomer(null);
            window.history.pushState({}, '', createPageUrl('Customers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${selectedCustomer.type === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {selectedCustomer.type === 'business' ? <Building2 className="w-8 h-8" /> : <UserCircle className="w-8 h-8" />}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold">{getCustomerName(selectedCustomer)}</h2>
                    <StatusBadge status={selectedCustomer.status} />
                  </div>
                  <p className="text-gray-500">{selectedCustomer.customer_number}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setView('form')}>
                  <Edit className="w-4 h-4 mr-2" />
                  Bearbeiten
                </Button>
                <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Kontaktinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.first_name && (
                    <div>
                      <p className="text-sm text-gray-500">Vorname</p>
                      <p className="font-medium">{selectedCustomer.first_name}</p>
                    </div>
                  )}
                  {selectedCustomer.last_name && (
                    <div>
                      <p className="text-sm text-gray-500">Nachname</p>
                      <p className="font-medium">{selectedCustomer.last_name}</p>
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div>
                      <p className="text-sm text-gray-500">E-Mail</p>
                      <p className="font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {selectedCustomer.email}
                      </p>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div>
                      <p className="text-sm text-gray-500">Telefon</p>
                      <p className="font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        {selectedCustomer.phone}
                      </p>
                    </div>
                  )}
                </div>
                {(selectedCustomer.address || selectedCustomer.city) && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500 flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4" />
                      Adresse
                    </p>
                    <p className="font-medium">{selectedCustomer.address}</p>
                    <p>{selectedCustomer.postal_code} {selectedCustomer.city}</p>
                    <p className="text-gray-600">{selectedCustomer.country}</p>
                  </div>
                )}
                {selectedCustomer.tax_id && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500">Steuernummer / USt-ID</p>
                    <p className="font-medium">{selectedCustomer.tax_id}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Preisliste</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {getTierCount(selectedCustomer.id) === 0 && (
                  <p className="text-gray-500 text-sm">Keine Preisstaffeln hinterlegt</p>
                )}
                {getTierCount(selectedCustomer.id) > 0 && (
                  <div className="space-y-2">
                    {tiersByCustomer[selectedCustomer.id].map((tier) => (
                      <div
                        key={tier.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {tier.min_km} km
                            {tier.max_km !== null && tier.max_km !== undefined
                              ? ` – ${tier.max_km} km`
                              : ' +'}
                          </span>
                          <span className="text-xs text-gray-500">Fix pro Auftrag</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-gray-700">
                          <span>Kunde: {Number(tier.customer_price).toFixed(2)} €</span>
                          <span>Fahrer: {Number(tier.driver_price).toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedCustomer.pricing_file_url && (
                  <a
                    href={selectedCustomer.pricing_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-[#1e3a5f] underline"
                  >
                    <FileText className="w-4 h-4" />
                    Preisliste herunterladen
                  </a>
                )}
              </CardContent>
            </Card>
          </div>

          {selectedCustomer.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Notizen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCustomer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du {getCustomerName(selectedCustomer)} wirklich löschen?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedCustomer.id)}
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="text-gray-500">{customers.length} Kunden insgesamt</p>
        </div>
        <Button 
          className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
          onClick={() => {
            setSelectedCustomer(null);
            setView('form');
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Kunde
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Suche nach Name, Kundennummer, E-Mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Keine Kunden gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <Card 
              key={customer.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => {
                setSelectedCustomer(customer);
                setView('details');
                window.history.pushState({}, '', createPageUrl('Customers') + `?id=${customer.id}`);
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${customer.type === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {customer.type === 'business' ? <Building2 className="w-6 h-6" /> : <UserCircle className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{getCustomerName(customer)}</h3>
                    <p className="text-sm text-gray-500">{customer.customer_number}</p>
                    {getTierCount(customer.id) > 0 && (
                      <p className="text-sm text-[#1e3a5f] font-medium mt-1">
                        {getTierCount(customer.id)} Preisstaffel
                        {getTierCount(customer.id) !== 1 ? 'n' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
