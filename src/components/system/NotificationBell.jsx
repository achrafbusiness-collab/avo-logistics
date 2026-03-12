import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Bell, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const DONE_STATUSES = new Set([
  'completed',
  'cancelled',
  'review',
  'ready_for_billing',
  'approved',
]);

export default function NotificationBell() {
  const today = new Date().toISOString().split('T')[0];

  const { data: orders = [] } = useQuery({
    queryKey: ['notification-orders'],
    queryFn: () =>
      appClient.entities.Order.list(
        '-dropoff_date',
        100,
        'id,order_number,license_plate,dropoff_date,status,assigned_driver_name'
      ),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const overdueOrders = orders.filter(
    (o) => !DONE_STATUSES.has(o.status) && o.dropoff_date && o.dropoff_date < today
  );

  const count = overdueOrders.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative"
          aria-label="Benachrichtigungen"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <p className="font-semibold text-sm">Benachrichtigungen</p>
          {count > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {count} überfällig
            </span>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
        </div>

        {/* Body */}
        <div className="max-h-[340px] overflow-y-auto">
          {overdueOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-slate-400">
              <Bell className="h-8 w-8 mb-3 opacity-20" />
              <p>Alles auf dem aktuellen Stand</p>
              <p className="text-xs mt-1 opacity-60">Keine überfälligen Aufträge</p>
            </div>
          ) : (
            <div className="divide-y">
              {overdueOrders.slice(0, 10).map((order) => (
                <Link
                  key={order.id}
                  to={createPageUrl('Orders') + `?id=${order.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="mt-0.5 flex-shrink-0 rounded-full bg-red-100 p-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{order.order_number}</p>
                    <p className="text-xs text-slate-500">{order.license_plate}</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Fällig:{' '}
                      {order.dropoff_date
                        ? format(new Date(order.dropoff_date + 'T00:00:00'), 'dd. MMM yyyy', { locale: de })
                        : '—'}
                    </p>
                  </div>
                </Link>
              ))}
              {overdueOrders.length > 10 && (
                <div className="px-4 py-2 text-xs text-slate-400 text-center">
                  +{overdueOrders.length - 10} weitere überfällige Aufträge
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {count > 0 && (
          <div className="border-t p-3">
            <Link to={createPageUrl('Orders') + '?list=active&due=overdue'}>
              <Button variant="outline" size="sm" className="w-full">
                Alle überfälligen Aufträge anzeigen
              </Button>
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
