import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import StatusBadge from '@/components/ui/StatusBadge';
import DriverForm from '@/components/drivers/DriverForm';
import { 
  Plus, 
  Search, 
  Filter,
  Users,
  ArrowLeft,
  Loader2,
  Phone,
  Mail,
  FileText,
  Edit,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Drivers() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list'); // list, form, details
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [billingRange, setBillingRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  });
  const [billingResults, setBillingResults] = useState([]);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list('-created_date', 500),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 500),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 1000),
  });

  const { data: orderSegments = [] } = useQuery({
    queryKey: ['order-segments'],
    queryFn: () => appClient.entities.OrderSegment.list('-created_date', 2000),
  });

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Driver.create(data),
    onSuccess: (created) => {
      if (created?.id) {
        queryClient.setQueryData(['drivers'], (prev = []) => {
          if (prev.some((driver) => driver.id === created.id)) {
            return prev;
          }
          return [created, ...prev];
        });
      }
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Driver.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Driver.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setView('list');
      setSelectedDriver(null);
      setDeleteConfirmOpen(false);
    },
  });

  useEffect(() => {
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedDriver(null);
    } else if (urlParams.get('id')) {
      const driver = drivers.find(d => d.id === urlParams.get('id'));
      if (driver) {
        setSelectedDriver(driver);
        setView('details');
      }
    }
  }, [urlParams.toString(), drivers]);

  const handleSave = async (data) => {
    if (selectedDriver) {
      const updated = await updateMutation.mutateAsync({ id: selectedDriver.id, data });
      setView('list');
      setSelectedDriver(null);
      window.history.pushState({}, '', createPageUrl('Drivers'));
      return updated;
    } else {
      const created = await createMutation.mutateAsync(data);
      return created;
    }
  };

  const getDriverFullName = (driver) => {
    return `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Unbekannt';
  };

  const filteredDrivers = drivers.filter(driver => {
    const fullName = getDriverFullName(driver);
    const matchesSearch = 
      fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.phone?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getDriverStats = (driverId) => {
    const driverOrders = orders.filter(o => o.assigned_driver_id === driverId);
    return {
      total: driverOrders.length,
      active: driverOrders.filter(o => ['assigned', 'accepted', 'pickup_started', 'in_transit', 'delivery_started'].includes(o.status)).length,
      completed: driverOrders.filter(o => o.status === 'completed').length,
    };
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);

  const expensesByOrder = useMemo(() => {
    return (checklists || []).reduce((acc, checklist) => {
      if (!checklist?.order_id || !Array.isArray(checklist.expenses)) return acc;
      const total = checklist.expenses.reduce((sum, expense) => {
        const amount = parseFloat(expense?.amount);
        if (Number.isFinite(amount)) {
          return sum + amount;
        }
        return sum;
      }, 0);
      acc[checklist.order_id] = (acc[checklist.order_id] || 0) + total;
      return acc;
    }, {});
  }, [checklists]);

  const getSegmentDateValue = (segment) => segment.created_date || segment.created_at;

  const getBillingRows = (driverId) => {
    const startDate = billingRange.start ? new Date(billingRange.start) : null;
    const endDate = billingRange.end ? new Date(billingRange.end) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    return orderSegments
      .filter((segment) => segment.driver_id === driverId)
      .map((segment) => {
        const rawDate = getSegmentDateValue(segment);
        const date = rawDate ? new Date(rawDate) : null;
        return {
          id: segment.id,
          date,
          dateLabel: date ? format(date, 'dd.MM.yyyy', { locale: de }) : '-',
          tour: `${segment.start_location || ''} → ${segment.end_location || ''}`.trim(),
          price: Number.isFinite(Number(segment.price)) ? Number(segment.price) : 0,
          expenses: segment.segment_type === 'dropoff' ? expensesByOrder[segment.order_id] || 0 : 0,
        };
      })
      .filter((row) => {
        if (!row.date) return false;
        if (startDate && row.date < startDate) return false;
        if (endDate && row.date > endDate) return false;
        return true;
      })
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  };

  const buildTotals = (rows) =>
    rows.reduce(
      (acc, row) => {
        acc.price += row.price;
        acc.expenses += row.expenses;
        return acc;
      },
      { price: 0, expenses: 0 }
    );

  const runBilling = () => {
    const results = selectedDriverIds
      .map((driverId) => {
        const driver = drivers.find((item) => item.id === driverId);
        if (!driver) return null;
        const rows = getBillingRows(driverId);
        const totals = buildTotals(rows);
        return { driver, rows, totals };
      })
      .filter(Boolean);
    setBillingResults(results);
  };

  const toggleDriverSelection = (driverId) => {
    setSelectedDriverIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]
    );
  };

  // Form View
  if (view === 'form') {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedDriver(null);
            window.history.pushState({}, '', createPageUrl('Drivers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>
        <DriverForm 
          driver={selectedDriver}
          onSave={handleSave}
          onCancel={() => {
            setView('list');
            setSelectedDriver(null);
            window.history.pushState({}, '', createPageUrl('Drivers'));
          }}
        />
      </div>
    );
  }

  // Details View
  if (view === 'details' && selectedDriver) {
    const stats = getDriverStats(selectedDriver.id);
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedDriver(null);
            window.history.pushState({}, '', createPageUrl('Drivers'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>

        <div className="space-y-6">
          {/* Header Card */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center text-2xl font-bold">
                  {selectedDriver.first_name?.charAt(0) || 'F'}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold">{getDriverFullName(selectedDriver)}</h2>
                    <StatusBadge status={selectedDriver.status} />
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {selectedDriver.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {selectedDriver.phone}
                    </span>
                  </div>
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
            {/* Personal Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Kontaktdaten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDriver.address && (
                  <div>
                    <p className="text-sm text-gray-500">Adresse</p>
                    <p className="font-medium">{selectedDriver.address}</p>
                    {(selectedDriver.postal_code || selectedDriver.city) && (
                      <p className="text-sm">{selectedDriver.postal_code} {selectedDriver.city}</p>
                    )}
                    {selectedDriver.country && (
                      <p className="text-sm text-gray-600">{selectedDriver.country}</p>
                    )}
                  </div>
                )}
                {selectedDriver.nationality && (
                  <div>
                    <p className="text-sm text-gray-500">Staatsangehörigkeit</p>
                    <p className="font-medium">{selectedDriver.nationality}</p>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-500">E-Mail</p>
                  <p className="font-medium">{selectedDriver.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Telefon</p>
                  <p className="font-medium">{selectedDriver.phone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Statistik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span>Aktive Aufträge</span>
                  <span className="font-bold text-lg text-blue-600">{stats.active}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span>Abgeschlossen</span>
                  <span className="font-bold text-lg text-green-600">{stats.completed}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span>Gesamt</span>
                  <span className="font-bold text-lg">{stats.total}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Abrechnung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Von</p>
                    <Input
                      type="date"
                      value={billingRange.start}
                      onChange={(event) =>
                        setBillingRange((prev) => ({ ...prev, start: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bis</p>
                    <Input
                      type="date"
                      value={billingRange.end}
                      onChange={(event) =>
                        setBillingRange((prev) => ({ ...prev, end: event.target.value }))
                      }
                    />
                  </div>
                </div>
                {(() => {
                  const rows = getBillingRows(selectedDriver.id);
                  const totals = buildTotals(rows);
                  if (rows.length === 0) {
                    return <p className="text-sm text-gray-500">Keine Touren im Zeitraum.</p>;
                  }
                  return (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Gesamtverdienst</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {formatCurrency(totals.price)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Nebenkosten</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {formatCurrency(totals.expenses)}
                          </p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500">
                              <th className="py-2 pr-4">Datum</th>
                              <th className="py-2 pr-4">Tour</th>
                              <th className="py-2 pr-4 text-right">Preis</th>
                              <th className="py-2 text-right">Nebenkosten</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.id} className="border-t">
                                <td className="py-2 pr-4">{row.dateLabel}</td>
                                <td className="py-2 pr-4 text-gray-700">{row.tour || "-"}</td>
                                <td className="py-2 pr-4 text-right">{formatCurrency(row.price)}</td>
                                <td className="py-2 text-right">{formatCurrency(row.expenses)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Dokumente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Führerschein Vorderseite', field: 'license_front' },
                    { label: 'Führerschein Rückseite', field: 'license_back' },
                    { label: 'Ausweis Vorderseite', field: 'id_card_front' },
                    { label: 'Ausweis Rückseite', field: 'id_card_back' },
                  ].map(({ label, field }) => (
                    <div key={field} className={`p-3 rounded-lg border ${selectedDriver[field] ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <p className="text-sm font-medium">{label}</p>
                      {selectedDriver[field] ? (
                        <a 
                          href={selectedDriver[field]} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Anzeigen
                        </a>
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">Nicht hochgeladen</p>
                      )}
                    </div>
                  ))}
                </div>
                {selectedDriver.license_expiry && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm">
                      <span className="font-medium">Führerschein gültig bis:</span>{' '}
                      {format(new Date(selectedDriver.license_expiry), 'dd.MM.yyyy', { locale: de })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {selectedDriver.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Notizen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedDriver.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fahrer löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du {getDriverFullName(selectedDriver)} wirklich löschen? 
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedDriver.id)}
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fahrer</h1>
          <p className="text-gray-500">{drivers.length} Fahrer insgesamt</p>
        </div>
        <Button 
          className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
          onClick={() => {
            setSelectedDriver(null);
            setView('form');
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Fahrer
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Suche nach Name, E-Mail, Telefon..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="active">Ready</SelectItem>
                <SelectItem value="pending">Bearbeitung</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Abrechnung erstellen</h3>
              <p className="text-sm text-gray-500">
                Fahrer auswählen und Zeitraum festlegen.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <p className="text-xs text-gray-500">Von</p>
                <Input
                  type="date"
                  value={billingRange.start}
                  onChange={(event) =>
                    setBillingRange((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-gray-500">Bis</p>
                <Input
                  type="date"
                  value={billingRange.end}
                  onChange={(event) =>
                    setBillingRange((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </div>
              <Button
                className="self-end bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                disabled={selectedDriverIds.length === 0}
                onClick={runBilling}
              >
                Abrechnung erstellen
              </Button>
            </div>
          </div>

          {selectedDriverIds.length === 0 && (
            <p className="text-sm text-gray-500">
              Bitte mindestens einen Fahrer auswählen.
            </p>
          )}

          {billingResults.length > 0 && (
            <div className="space-y-6">
              {billingResults.map(({ driver, rows, totals }) => (
                <div key={driver.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold">{getDriverFullName(driver)}</p>
                      <p className="text-xs text-gray-500">{driver.email}</p>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span>Verdienst: <strong>{formatCurrency(totals.price)}</strong></span>
                      <span>Nebenkosten: <strong>{formatCurrency(totals.expenses)}</strong></span>
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-sm text-gray-500">Keine Touren im Zeitraum.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-2 pr-4">Datum</th>
                            <th className="py-2 pr-4">Tour</th>
                            <th className="py-2 pr-4 text-right">Preis</th>
                            <th className="py-2 text-right">Nebenkosten</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="py-2 pr-4">{row.dateLabel}</td>
                              <td className="py-2 pr-4 text-gray-700">{row.tour || "-"}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(row.price)}</td>
                              <td className="py-2 text-right">{formatCurrency(row.expenses)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Driver Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredDrivers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Keine Fahrer gefunden</p>
            {searchTerm || statusFilter !== 'all' ? (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : (
              <Button 
                className="mt-4 bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                onClick={() => setView('form')}
              >
                Ersten Fahrer hinzufügen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDrivers.map((driver) => {
            const stats = getDriverStats(driver.id);
            const isSelected = selectedDriverIds.includes(driver.id);
            return (
              <Card 
                key={driver.id}
                className="cursor-pointer hover:shadow-lg transition-shadow relative"
                onClick={() => {
                  setSelectedDriver(driver);
                  setView('details');
                  window.history.pushState({}, '', createPageUrl('Drivers') + `?id=${driver.id}`);
                }}
              >
                <CardContent className="p-6">
                  <div className="absolute top-3 right-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDriverSelection(driver.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 accent-[#1e3a5f]"
                      aria-label="Fahrer auswählen"
                    />
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0">
                      {driver.first_name?.charAt(0) || 'F'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{getDriverFullName(driver)}</h3>
                        <StatusBadge status={driver.status} size="sm" />
                      </div>
                      <p className="text-sm text-gray-500 truncate">{driver.email}</p>
                      <p className="text-sm text-gray-500">{driver.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-4 pt-4 border-t text-sm">
                    <div>
                      <span className="text-gray-500">Aktiv:</span>{' '}
                      <span className="font-medium text-blue-600">{stats.active}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Abgeschlossen:</span>{' '}
                      <span className="font-medium text-green-600">{stats.completed}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
