import React from 'react';
import { Badge } from "@/components/ui/badge";

const statusConfig = {
  // Order Status
  new: { label: 'Offen', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  assigned: { label: 'Zugewiesen', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  pickup_started: { label: 'Übernahme läuft', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  in_transit: { label: 'In Lieferung', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  shuttle: { label: 'Shuttle', className: 'bg-teal-100 text-teal-800 border-teal-200' },
  zwischenabgabe: { label: 'Zwischenabgabe', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  delivery_started: { label: 'Übergabe läuft', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  completed: { label: 'Erfolgreich beendet', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  review: { label: 'Prüfung', className: 'bg-slate-100 text-slate-800 border-slate-200' },
  ready_for_billing: { label: 'Freigabe Abrechnung', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  approved: { label: 'Freigegeben', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Storniert', className: 'bg-red-100 text-red-800 border-red-200' },
  
  // Driver Status
  active: { label: 'Ready', className: 'bg-green-100 text-green-800 border-green-200' },
  inactive: { label: 'Inaktiv', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  pending: { label: 'Bearbeitung', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  
  // Checklist Type
  pickup: { label: 'Abholung', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  dropoff: { label: 'Abgabe', className: 'bg-green-100 text-green-800 border-green-200' },
};

export default function StatusBadge({ status, size = 'default', label }) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
  const displayLabel = label || config.label;
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.className} border font-medium ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''}`}
    >
      {displayLabel}
    </Badge>
  );
}
