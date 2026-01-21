import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  Search as SearchIcon, 
  Truck,
  Users,
  ArrowRight,
  Loader2
} from 'lucide-react';

export default function Search() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 1000),
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list('-created_date', 1000),
  });

  const isLoading = ordersLoading || driversLoading;

  const searchLower = searchTerm.toLowerCase();

  const filteredOrders = orders.filter(order => 
    order.order_number?.toLowerCase().includes(searchLower) ||
    order.license_plate?.toLowerCase().includes(searchLower) ||
    order.vehicle_brand?.toLowerCase().includes(searchLower) ||
    order.vehicle_model?.toLowerCase().includes(searchLower) ||
    order.vin?.toLowerCase().includes(searchLower) ||
    order.assigned_driver_name?.toLowerCase().includes(searchLower) ||
    order.customer_name?.toLowerCase().includes(searchLower) ||
    order.pickup_city?.toLowerCase().includes(searchLower) ||
    order.dropoff_city?.toLowerCase().includes(searchLower)
  );

  const filteredDrivers = drivers.filter(driver =>
    driver.name?.toLowerCase().includes(searchLower) ||
    driver.email?.toLowerCase().includes(searchLower) ||
    driver.phone?.toLowerCase().includes(searchLower)
  );

  const hasResults = filteredOrders.length > 0 || filteredDrivers.length > 0;
  const totalResults = filteredOrders.length + filteredDrivers.length;

  const ResultCard = ({ type, children, to }) => (
    <Link to={to} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          {children}
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suche</h1>
        <p className="text-gray-500">Durchsuche Aufträge und Fahrer</p>
      </div>

      {/* Search Input */}
      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input 
              placeholder="Kennzeichen, Auftragsnummer, Fahrername, VIN, Ort..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-6 text-lg"
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : searchTerm.length < 2 ? (
        <Card>
          <CardContent className="text-center py-12">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Gib mindestens 2 Zeichen ein, um zu suchen</p>
          </CardContent>
        </Card>
      ) : !hasResults ? (
        <Card>
          <CardContent className="text-center py-12">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Keine Ergebnisse für "{searchTerm}"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            {totalResults} Ergebnis{totalResults !== 1 && 'se'} gefunden
          </p>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="all">
                Alle ({totalResults})
              </TabsTrigger>
              <TabsTrigger value="orders" disabled={filteredOrders.length === 0}>
                Aufträge ({filteredOrders.length})
              </TabsTrigger>
              <TabsTrigger value="drivers" disabled={filteredDrivers.length === 0}>
                Fahrer ({filteredDrivers.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-6 mt-6">
              {/* Orders */}
              {filteredOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Aufträge ({filteredOrders.length})
                  </h3>
                  <div className="space-y-2">
                    {filteredOrders.slice(0, 5).map(order => (
                      <ResultCard key={order.id} to={createPageUrl('Orders') + `?id=${order.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-lg flex items-center justify-center">
                              <Truck className="w-5 h-5 text-[#1e3a5f]" />
                            </div>
                            <div>
                              <p className="font-semibold">{order.order_number}</p>
                              <p className="text-sm text-gray-500">
                                {order.license_plate} • {order.vehicle_brand} {order.vehicle_model}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={order.status} />
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </ResultCard>
                    ))}
                    {filteredOrders.length > 5 && (
                      <Button 
                        variant="ghost" 
                        className="w-full"
                        onClick={() => setActiveTab('orders')}
                      >
                        Alle {filteredOrders.length} Aufträge anzeigen
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Drivers */}
              {filteredDrivers.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Fahrer ({filteredDrivers.length})
                  </h3>
                  <div className="space-y-2">
                    {filteredDrivers.slice(0, 5).map(driver => (
                      <ResultCard key={driver.id} to={createPageUrl('Drivers') + `?id=${driver.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center font-bold">
                              {driver.name?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold">{driver.name}</p>
                              <p className="text-sm text-gray-500">{driver.email} • {driver.phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={driver.status} />
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </ResultCard>
                    ))}
                    {filteredDrivers.length > 5 && (
                      <Button 
                        variant="ghost" 
                        className="w-full"
                        onClick={() => setActiveTab('drivers')}
                      >
                        Alle {filteredDrivers.length} Fahrer anzeigen
                      </Button>
                    )}
                  </div>
                </div>
              )}

            </TabsContent>

            <TabsContent value="orders" className="space-y-2 mt-6">
              {filteredOrders.map(order => (
                <ResultCard key={order.id} to={createPageUrl('Orders') + `?id=${order.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-lg flex items-center justify-center">
                        <Truck className="w-5 h-5 text-[#1e3a5f]" />
                      </div>
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-sm text-gray-500">
                          {order.license_plate} • {order.vehicle_brand} {order.vehicle_model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={order.status} />
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </ResultCard>
              ))}
            </TabsContent>

            <TabsContent value="drivers" className="space-y-2 mt-6">
              {filteredDrivers.map(driver => (
                <ResultCard key={driver.id} to={createPageUrl('Drivers') + `?id=${driver.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center font-bold">
                        {driver.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{driver.name}</p>
                        <p className="text-sm text-gray-500">{driver.email} • {driver.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={driver.status} />
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </ResultCard>
              ))}
            </TabsContent>

          </Tabs>
        </div>
      )}
    </div>
  );
}
