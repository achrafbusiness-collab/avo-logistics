import React from 'react';
import { Badge } from "@/components/ui/badge";

const statusConfig = {
  // Order Status
  new: { label: 'Neu', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  assigned: { label: 'Zugeteilt', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  accepted: { label: 'Angenommen', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  pickup_started: { label: 'Übernahme', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  in_transit: { label: 'Bearbeitung', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  delivery_started: { label: 'Übergabe', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  completed: { label: 'Fertig', className: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Storniert', className: 'bg-red-100 text-red-800 border-red-200' },
  
  // Driver Status
  active: { label: 'Ready', className: 'bg-green-100 text-green-800 border-green-200' },
  inactive: { label: 'Inaktiv', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  pending: { label: 'Bearbeitung', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  
  // Checklist Type
  pickup: { label: 'Abholung', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  dropoff: { label: 'Abgabe', className: 'bg-green-100 text-green-800 border-green-200' },
};

export default function StatusBadge({ status, size = 'default' }) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.className} border font-medium ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''}`}
    >
      {config.label}
    </Badge>
  );
}
