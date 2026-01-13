import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
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
  MapPin
} from 'lucide-react';

export default function Customers() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
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


  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
      };

      let savedCustomer = null;
      if (selectedCustomer) {
        savedCustomer = await updateMutation.mutateAsync({
          id: selectedCustomer.id,
          data: dataToSave,
        });
      } else {
        savedCustomer = await createMutation.mutateAsync(dataToSave);
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (savedCustomer) {
        setSelectedCustomer(savedCustomer);
      }
      setView('details');
    } catch (err) {
      console.error(err);
    } finally {
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
