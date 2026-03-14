import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X, Building2, UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function CustomerSelect({
  customers = [],
  value,
  onChange,
  placeholder = 'Kunde auswählen...',
  showPrice,
  distanceKm,
}) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (!value) return null;
    return customers.find((c) => c.id === value) || null;
  }, [value, customers]);

  const handleSelect = (customer) => {
    onChange(customer);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  const getPriceLabel = (customer) => {
    if (!showPrice || !customer?.price_list?.length) return null;
    const dist = parseFloat(distanceKm);
    if (!Number.isFinite(dist)) return null;
    const sorted = [...customer.price_list].sort((a, b) => (a.min_km ?? 0) - (b.min_km ?? 0));
    for (const range of sorted) {
      const min = range.min_km ?? 0;
      const max = range.max_km ?? Infinity;
      if (dist >= min && dist <= max) {
        return `${range.price} €`;
      }
    }
    return null;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              {selected.type === 'business' ? (
                <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
              ) : (
                <UserIcon className="w-4 h-4 text-gray-500 shrink-0" />
              )}
              <span className="truncate">
                {selected.label}
                {showPrice && getPriceLabel(selected) && (
                  <span className="ml-2 text-green-600 font-medium">
                    → {getPriceLabel(selected)}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {selected && (
              <X
                className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="w-4 h-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Kunde suchen..." />
          <CommandList>
            <CommandEmpty>Kein Kunde gefunden.</CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => {
                const priceLabel = getPriceLabel(customer);
                return (
                  <CommandItem
                    key={customer.id}
                    value={customer.label}
                    onSelect={() => handleSelect(customer)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          'w-4 h-4 shrink-0',
                          value === customer.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {customer.type === 'business' ? (
                        <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <span className="truncate">{customer.label}</span>
                    </div>
                    {showPrice && priceLabel && (
                      <span className="text-xs text-green-600 font-medium shrink-0 ml-2">
                        {priceLabel}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
