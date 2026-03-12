import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Truck,
  Users,
  User,
  LayoutDashboard,
  BarChart3,
  Settings,
  ShieldCheck,
  Plus,
} from 'lucide-react';

const NAV_PAGES = [
  { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', shortcut: 'G D' },
  { label: 'Aufträge', icon: Truck, page: 'Orders', shortcut: 'G A' },
  { label: 'Fahrer', icon: Users, page: 'Drivers', shortcut: 'G F' },
  { label: 'Kunden & Finanzen', icon: User, page: 'Customers', shortcut: 'G K' },
  { label: 'Statistik', icon: BarChart3, page: 'Statistics', shortcut: 'G S' },
  { label: 'App & Einstellungen', icon: Settings, page: 'AppConnection' },
  { label: 'Admin Controlling', icon: ShieldCheck, page: 'AdminControlling' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () =>
      appClient.entities.Order.list(
        '-created_date',
        300,
        'id,order_number,license_plate,vehicle_brand,vehicle_model,assigned_driver_name,status,pickup_city,dropoff_city'
      ),
    staleTime: 30_000,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () =>
      appClient.entities.Driver.list('-created_date', 300, 'id,first_name,last_name,email'),
    staleTime: 30_000,
  });

  useEffect(() => {
    const down = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = useCallback((fn) => {
    setOpen(false);
    fn();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Seite, Auftrag oder Fahrer suchen..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_PAGES.map((item) => (
            <CommandItem
              key={item.page}
              value={item.label}
              onSelect={() => runCommand(() => navigate(createPageUrl(item.page)))}
            >
              <item.icon className="mr-2 h-4 w-4 shrink-0" />
              {item.label}
              {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Schnellaktionen">
          <CommandItem
            value="neuer auftrag erstellen"
            onSelect={() => runCommand(() => navigate(createPageUrl('Orders') + '?new=true'))}
          >
            <Plus className="mr-2 h-4 w-4" />
            Neuen Auftrag erstellen
          </CommandItem>
          <CommandItem
            value="neuen fahrer anlegen"
            onSelect={() => runCommand(() => navigate(createPageUrl('Drivers') + '?new=true'))}
          >
            <Plus className="mr-2 h-4 w-4" />
            Neuen Fahrer anlegen
          </CommandItem>
        </CommandGroup>

        {orders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Aufträge">
              {orders.map((order) => (
                <CommandItem
                  key={order.id}
                  value={`auftrag ${order.order_number} ${order.license_plate || ''} ${order.vehicle_brand || ''} ${order.vehicle_model || ''} ${order.assigned_driver_name || ''} ${order.pickup_city || ''} ${order.dropoff_city || ''}`}
                  onSelect={() => runCommand(() => navigate(createPageUrl('Orders') + `?id=${order.id}`))}
                >
                  <Truck className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-medium">{order.order_number}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {order.license_plate}
                    {order.pickup_city && order.dropoff_city
                      ? ` — ${order.pickup_city} → ${order.dropoff_city}`
                      : ''}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {drivers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Fahrer">
              {drivers.map((driver) => (
                <CommandItem
                  key={driver.id}
                  value={`fahrer ${driver.first_name || ''} ${driver.last_name || ''} ${driver.email || ''}`}
                  onSelect={() => runCommand(() => navigate(createPageUrl('Drivers') + `?id=${driver.id}`))}
                >
                  <Users className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{driver.first_name} {driver.last_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{driver.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="border-t px-3 py-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span><kbd className="font-mono font-semibold">↑↓</kbd> Navigieren</span>
        <span><kbd className="font-mono font-semibold">↵</kbd> Öffnen</span>
        <span><kbd className="font-mono font-semibold">Esc</kbd> Schließen</span>
        <span className="ml-auto"><kbd className="font-mono font-semibold">⌘K</kbd> öffnet diese Suche</span>
      </div>
    </CommandDialog>
  );
}
