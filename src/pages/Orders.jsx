import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import OrderForm from '@/components/orders/OrderForm';
import OrderDetails from '@/components/orders/OrderDetails';
import { 
  Plus, 
  Search, 
  Filter,
  Truck,
  ArrowLeft,
  Loader2
} from 'lucide-react';

export default function Orders() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [view, setView] = useState('list'); // list, form, details
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 500),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 1000),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.filter({ status: 'active' }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Order.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
      setSelectedOrder(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Order.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setView('list');
      setSelectedOrder(null);
      setDeleteConfirmOpen(false);
    },
  });

  // Handle URL params
  useEffect(() => {
    if (urlParams.get('new') === 'true') {
      setView('form');
      setSelectedOrder(null);
    } else if (urlParams.get('id')) {
      const order = orders.find(o => o.id === urlParams.get('id'));
      if (order) {
        setSelectedOrder(order);
        setView('details');
      }
    }
    if (urlParams.get('status')) {
      setStatusFilter(urlParams.get('status'));
    }
  }, [urlParams.toString(), orders]);

  const handleSave = async (data) => {
    if (selectedOrder) {
      await updateMutation.mutateAsync({ id: selectedOrder.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleAssignDriver = async (driverId) => {
    if (!selectedOrder) return;
    const driver = drivers.find(d => d.id === driverId);
    const driverName = driver ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() : '';
    const updates = {
      assigned_driver_id: driverId,
      assigned_driver_name: driverName,
    };
    if (driverId) {
      updates.status = 'assigned';
    }
    const updated = await appClient.entities.Order.update(selectedOrder.id, updates);
    setSelectedOrder(updated);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.license_plate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.vehicle_brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.assigned_driver_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getOrderChecklists = (orderId) => {
    return checklists.filter(c => c.order_id === orderId);
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
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>
        <OrderForm 
          order={selectedOrder}
          onSave={handleSave}
          onCancel={() => {
            setView('list');
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        />
      </div>
    );
  }

  // Details View
  if (view === 'details' && selectedOrder) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            setView('list');
            setSelectedOrder(null);
            window.history.pushState({}, '', createPageUrl('Orders'));
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Liste
        </Button>
        <OrderDetails 
          order={selectedOrder}
          checklists={getOrderChecklists(selectedOrder.id)}
          drivers={drivers}
          onAssignDriver={handleAssignDriver}
          onEdit={() => setView('form')}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Auftrag löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du den Auftrag {selectedOrder.order_number} wirklich löschen? 
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedOrder.id)}
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
          <h1 className="text-2xl font-bold text-gray-900">Aufträge</h1>
          <p className="text-gray-500">{orders.length} Aufträge insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => window.location.href = createPageUrl('AIImport')}
          >
            <Truck className="w-4 h-4 mr-2" />
            AI Import
          </Button>
          <Button 
            className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            onClick={() => {
              setSelectedOrder(null);
              setView('form');
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Neuer Auftrag
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Suche nach Auftragsnummer, Kennzeichen, Fahrer..."
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
                <SelectItem value="new">Neu</SelectItem>
                <SelectItem value="assigned">Zugewiesen</SelectItem>
                <SelectItem value="in_transit">Unterwegs</SelectItem>
                <SelectItem value="picked_up">Abgeholt</SelectItem>
                <SelectItem value="delivered">Geliefert</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
                <SelectItem value="cancelled">Storniert</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Keine Aufträge gefunden</p>
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
                  Ersten Auftrag erstellen
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Auftrag</TableHead>
                    <TableHead>Fahrzeug</TableHead>
                    <TableHead className="hidden md:table-cell">Route</TableHead>
                    <TableHead className="hidden lg:table-cell">Fahrer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Erstellt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow 
                      key={order.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        setSelectedOrder(order);
                        setView('details');
                        window.history.pushState({}, '', createPageUrl('Orders') + `?id=${order.id}`);
                      }}
                    >
                      <TableCell>
                        <div>
                          <p className="font-semibold text-[#1e3a5f]">{order.order_number}</p>
                          <p className="text-sm text-gray-500">{order.license_plate}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
                          <p className="text-sm text-gray-500">{order.vehicle_color}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-sm">
                          <p>{order.pickup_city || 'N/A'}</p>
                          <p className="text-gray-400">→</p>
                          <p>{order.dropoff_city || 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {order.assigned_driver_name || (
                          <span className="text-gray-400">Nicht zugewiesen</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                        {format(new Date(order.created_date), 'dd.MM.yyyy', { locale: de })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
