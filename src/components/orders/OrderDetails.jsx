import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from '@/components/ui/StatusBadge';
import { 
  Car, 
  MapPin, 
  Calendar, 
  User, 
  Edit,
  FileText,
  ClipboardList,
  Phone,
  Mail,
  Trash2,
  ExternalLink
} from 'lucide-react';

export default function OrderDetails({ order, checklists = [], onEdit, onDelete }) {
  const pickupChecklist = checklists.find(c => c.type === 'pickup');
  const dropoffChecklist = checklists.find(c => c.type === 'dropoff');
  const formatDateSafe = (value, pattern) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, pattern, { locale: de });
  };
  const pickupDate = formatDateSafe(order.pickup_date, 'dd.MM.yyyy');
  const dropoffDate = formatDateSafe(order.dropoff_date, 'dd.MM.yyyy');
  const pickupChecklistDate = formatDateSafe(pickupChecklist?.datetime, 'dd.MM.yyyy HH:mm');
  const dropoffChecklistDate = formatDateSafe(dropoffChecklist?.datetime, 'dd.MM.yyyy HH:mm');

  const InfoRow = ({ label, value, icon: Icon }) => (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5" />}
      <div className="flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-medium text-gray-900">{value || '-'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <CardTitle className="text-2xl">{order.order_number}</CardTitle>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-gray-500">
              {order.vehicle_brand} {order.vehicle_model} • {order.license_plate}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Bearbeiten
            </Button>
            <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vehicle */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Car className="w-5 h-5 text-[#1e3a5f]" />
                Fahrzeug
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoRow label="Kennzeichen" value={order.license_plate} />
              <InfoRow label="Marke" value={order.vehicle_brand} />
              <InfoRow label="Modell" value={order.vehicle_model} />
              <InfoRow label="Farbe" value={order.vehicle_color} />
              <InfoRow label="VIN" value={order.vin} />
            </CardContent>
          </Card>

          {/* Route */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#1e3a5f]" />
                Route
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pickup */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">A</span>
                    </div>
                    Abholung
                  </h4>
                  <p className="font-medium">{order.pickup_address}</p>
                  <p className="text-sm text-gray-600">{order.pickup_city}</p>
                  {pickupDate && (
                    <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {pickupDate}
                      {order.pickup_time && ` um ${order.pickup_time}`}
                    </p>
                  )}
                </div>

                {/* Dropoff */}
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">B</span>
                    </div>
                    Abgabe
                  </h4>
                  <p className="font-medium">{order.dropoff_address}</p>
                  <p className="text-sm text-gray-600">{order.dropoff_city}</p>
                  {dropoffDate && (
                    <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {dropoffDate}
                      {order.dropoff_time && ` um ${order.dropoff_time}`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer */}
          {(order.customer_name || order.customer_phone || order.customer_email) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-[#1e3a5f]" />
                  Kunde
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoRow label="Name" value={order.customer_name} icon={User} />
                <InfoRow label="Telefon" value={order.customer_phone} icon={Phone} />
                <InfoRow label="E-Mail" value={order.customer_email} icon={Mail} />
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Bemerkungen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Driver */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-[#1e3a5f]" />
                Fahrer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.assigned_driver_id ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center font-semibold">
                    {order.assigned_driver_name?.charAt(0) || 'F'}
                  </div>
                  <div>
                    <p className="font-medium">{order.assigned_driver_name}</p>
                    <Link 
                      to={createPageUrl('Drivers') + `?id=${order.assigned_driver_id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Details anzeigen
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Kein Fahrer zugewiesen</p>
              )}
            </CardContent>
          </Card>

          {/* Price */}
          {order.price !== undefined && order.price !== null && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Auftragswert</p>
                <p className="text-3xl font-bold text-[#1e3a5f]">
                  {order.price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Checklists */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#1e3a5f]" />
                Protokolle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Pickup Checklist */}
              <div className={`p-3 rounded-lg border ${pickupChecklist ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Abholung</p>
                    {pickupChecklist ? (
                      <p className="text-sm text-gray-600">
                        {pickupChecklistDate || 'Datum fehlt'}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Noch nicht erstellt</p>
                    )}
                  </div>
                  {pickupChecklist && (
                    <Link to={createPageUrl('Checklists') + `?id=${pickupChecklist.id}`}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Dropoff Checklist */}
              <div className={`p-3 rounded-lg border ${dropoffChecklist ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Abgabe</p>
                    {dropoffChecklist ? (
                      <p className="text-sm text-gray-600">
                        {dropoffChecklistDate || 'Datum fehlt'}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Noch nicht erstellt</p>
                    )}
                  </div>
                  {dropoffChecklist && (
                    <Link to={createPageUrl('Checklists') + `?id=${dropoffChecklist.id}`}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PDF */}
          {order.pdf_url && (
            <Card>
              <CardContent className="pt-6">
                <a href={order.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                    <FileText className="w-4 h-4 mr-2" />
                    Protokoll-PDF öffnen
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
