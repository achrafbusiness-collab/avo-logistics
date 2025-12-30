import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import StatusBadge from '@/components/ui/StatusBadge';
import { MANDATORY_CHECKS } from '@/components/driver/MandatoryChecklist';
import { 
  Search, 
  Filter,
  ClipboardList,
  Loader2,
  Camera,
  MapPin,
  Clock,
  Fuel,
  Car,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  FileText,
  X
} from 'lucide-react';

export default function Checklists() {
  const urlParams = new URLSearchParams(window.location.search);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 500),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 1000),
  });

  const ordersById = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc[order.id] = order;
      return acc;
    }, {});
  }, [orders]);

  React.useEffect(() => {
    if (urlParams.get('id')) {
      const checklist = checklists.find(c => c.id === urlParams.get('id'));
      if (checklist) {
        setSelectedChecklist(checklist);
        setShowDetails(true);
      }
    }
  }, [urlParams.toString(), checklists]);

  const filteredChecklists = checklists.filter(checklist => {
    const matchesSearch = 
      checklist.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      checklist.driver_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      checklist.location?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || checklist.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const AccessoryItem = ({ label, value }) => (
    <div className="flex items-center gap-2">
      {value ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500" />
      )}
      <span className={value ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
    </div>
  );

  const ChecklistDetails = ({ checklist, order }) => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <div className="flex items-center gap-3">
            <StatusBadge status={checklist.type} />
            <span className="font-semibold text-lg">{checklist.order_number}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {checklist.driver_name} • {checklist.datetime && format(new Date(checklist.datetime), 'dd.MM.yyyy HH:mm', { locale: de })}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/protocol-pdf?checklistId=${checklist.id}&print=1`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </a>
          <a
            href={`/expenses-pdf?checklistId=${checklist.id}&print=1`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Auslagen
            </Button>
          </a>
          <Link to={createPageUrl('Orders') + `?id=${checklist.order_id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" />
              Zum Auftrag
            </Button>
          </Link>
        </div>
      </div>

      {order && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg space-y-2">
            <h4 className="font-medium">Fahrzeug</h4>
            <p className="text-sm text-gray-600">
              {order.vehicle_brand} {order.vehicle_model} • {order.license_plate}
            </p>
            {order.vin && <p className="text-xs font-mono text-gray-500">{order.vin}</p>}
            {order.vehicle_color && <p className="text-sm text-gray-500">Farbe: {order.vehicle_color}</p>}
          </div>
          <div className="p-4 border rounded-lg space-y-2">
            <h4 className="font-medium">Kunde</h4>
            <p className="text-sm text-gray-700">{order.customer_name || '-'}</p>
            {order.customer_email && <p className="text-sm text-gray-500">{order.customer_email}</p>}
            {order.customer_phone && <p className="text-sm text-gray-500">{order.customer_phone}</p>}
          </div>
          <div className="p-4 border rounded-lg space-y-2 md:col-span-2">
            <h4 className="font-medium">Route</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Abholung</p>
                <p className="font-medium">{order.pickup_address}</p>
                <p className="text-gray-600">
                  {order.pickup_postal_code} {order.pickup_city}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Abgabe</p>
                <p className="font-medium">{order.dropoff_address}</p>
                <p className="text-gray-600">
                  {order.dropoff_postal_code} {order.dropoff_city}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Car className="w-4 h-4" />
            Kilometerstand
          </div>
          <p className="font-semibold">{checklist.kilometer?.toLocaleString()} km</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Fuel className="w-4 h-4" />
            Tankstand
          </div>
          <p className="font-semibold">{checklist.fuel_level || '-'}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <MapPin className="w-4 h-4" />
            Ort
          </div>
          <p className="font-semibold">{checklist.location || '-'}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" />
            Zeitpunkt
          </div>
          <p className="font-semibold">
            {checklist.datetime && format(new Date(checklist.datetime), 'HH:mm', { locale: de })}
          </p>
        </div>
      </div>

      {/* Cleanliness */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Sauberkeit innen</h4>
          <Badge variant="outline" className={
            checklist.cleanliness_inside === 'clean' ? 'bg-green-100 text-green-800' :
            checklist.cleanliness_inside === 'normal' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }>
            {checklist.cleanliness_inside === 'clean' ? 'Sauber' :
             checklist.cleanliness_inside === 'normal' ? 'Normal' : 'Verschmutzt'}
          </Badge>
        </div>
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Sauberkeit außen</h4>
          <Badge variant="outline" className={
            checklist.cleanliness_outside === 'clean' ? 'bg-green-100 text-green-800' :
            checklist.cleanliness_outside === 'normal' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }>
            {checklist.cleanliness_outside === 'clean' ? 'Sauber' :
             checklist.cleanliness_outside === 'normal' ? 'Normal' : 'Verschmutzt'}
          </Badge>
        </div>
      </div>

      {/* Accessories */}
      {checklist.accessories && (
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-3">Zubehör</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <AccessoryItem label="Reserverad" value={checklist.accessories.spare_wheel} />
            <AccessoryItem label="Warndreieck" value={checklist.accessories.warning_triangle} />
            <AccessoryItem label="Verbandskasten" value={checklist.accessories.first_aid_kit} />
            <AccessoryItem label="Warnweste" value={checklist.accessories.safety_vest} />
            <AccessoryItem label="Wagenheber" value={checklist.accessories.car_jack} />
            <AccessoryItem label="Radmutternschlüssel" value={checklist.accessories.wheel_wrench} />
            <AccessoryItem label="Handbuch" value={checklist.accessories.manual} />
            <AccessoryItem label="Serviceheft" value={checklist.accessories.service_book} />
            <AccessoryItem label="Fahrzeugschein" value={checklist.accessories.registration_doc} />
          </div>
          {checklist.accessories.keys_count && (
            <p className="mt-3 text-sm">
              <span className="text-gray-500">Anzahl Schlüssel:</span>{' '}
              <span className="font-medium">{checklist.accessories.keys_count}</span>
            </p>
          )}
        </div>
      )}

      {/* Mandatory Checks */}
      {checklist.mandatory_checks && Object.keys(checklist.mandatory_checks).length > 0 && (
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-3">Pflicht-Prüfungen</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {MANDATORY_CHECKS.map((check) => {
              const value = checklist.mandatory_checks?.[check.id];
              return (
                <div key={check.id} className="flex items-center gap-2 text-sm">
                  {value === true ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : value === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-300" />
                  )}
                  <span className={value === false ? 'text-red-600' : 'text-gray-700'}>
                    {check.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Damages */}
      {checklist.damages && checklist.damages.length > 0 && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <h4 className="font-medium mb-3 text-red-800">Schäden ({checklist.damages.length})</h4>
          <div className="space-y-2">
            {checklist.damages.map((damage, i) => (
              <div key={i} className="p-3 bg-white rounded border border-red-100">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={
                    damage.severity === 'severe' ? 'bg-red-100 text-red-800' :
                    damage.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }>
                    {damage.severity === 'severe' ? 'Schwer' :
                     damage.severity === 'medium' ? 'Mittel' : 'Leicht'}
                  </Badge>
                  <span className="font-medium">{damage.location}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{damage.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {checklist.photos && checklist.photos.length > 0 && (
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Fotos ({checklist.photos.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {checklist.photos.map((photo, i) => (
              <button
                key={i}
                type="button"
                className="text-left"
                onClick={() => setSelectedPhoto(photo)}
              >
                <div className="aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity">
                  <img 
                    src={photo.url} 
                    alt={photo.caption || photo.type}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                  {photo.caption || photo.type}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-4">
        {checklist.signature_driver && (
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2">Unterschrift Fahrer</h4>
            <img 
              src={checklist.signature_driver} 
              alt="Unterschrift Fahrer"
              className="max-h-24 border rounded"
            />
          </div>
        )}
        {checklist.signature_customer && (
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2">Unterschrift Kunde</h4>
            <p className="text-sm text-gray-500 mb-1">{checklist.customer_name}</p>
            <img 
              src={checklist.signature_customer} 
              alt="Unterschrift Kunde"
              className="max-h-24 border rounded"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      {checklist.notes && (
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Bemerkungen</h4>
          <p className="text-gray-700 whitespace-pre-wrap">{checklist.notes}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Protokolle</h1>
          <p className="text-gray-500">{checklists.length} Protokolle insgesamt</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Suche nach Auftragsnummer, Fahrer, Ort..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="pickup">Abholung</SelectItem>
                <SelectItem value="dropoff">Abgabe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredChecklists.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Keine Protokolle gefunden</p>
            {(searchTerm || typeFilter !== 'all') && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                }}
              >
                Filter zurücksetzen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredChecklists.map((checklist) => (
            <Card 
              key={checklist.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedChecklist(checklist);
                setShowDetails(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      checklist.type === 'pickup' ? 'bg-blue-100' : 'bg-green-100'
                    }`}>
                      <ClipboardList className={`w-6 h-6 ${
                        checklist.type === 'pickup' ? 'text-blue-600' : 'text-green-600'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={checklist.type} size="sm" />
                        <span className="font-semibold">{checklist.order_number}</span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {checklist.driver_name} • {checklist.location || 'Kein Ort'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{checklist.kilometer?.toLocaleString()} km</p>
                    <p className="text-sm text-gray-500">
                      {checklist.datetime && format(new Date(checklist.datetime), 'dd.MM.yyyy', { locale: de })}
                    </p>
                  </div>
                </div>
                {checklist.photos && checklist.photos.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-gray-500">
                    <Camera className="w-4 h-4" />
                    {checklist.photos.length} Fotos
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Protokoll Details</DialogTitle>
          </DialogHeader>
          {selectedChecklist && (
            <ChecklistDetails
              checklist={selectedChecklist}
              order={ordersById[selectedChecklist.order_id]}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <Button 
            variant="ghost" 
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setSelectedPhoto(null)}
          >
            <X className="w-6 h-6" />
          </Button>
          <img 
            src={selectedPhoto.url}
            alt={selectedPhoto.caption || selectedPhoto.type}
            className="max-w-full max-h-[80vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedPhoto.caption && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded">
              {selectedPhoto.caption}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
