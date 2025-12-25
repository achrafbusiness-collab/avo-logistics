import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 3;

const buildAddress = (feature) => {
  const street = feature?.text || "";
  const number = feature?.address || feature?.properties?.address || "";
  if (street && number) {
    return `${street} ${number}`.trim();
  }
  if (feature?.place_name) {
    return feature.place_name.split(",")[0].trim();
  }
  return street;
};

const findContextValue = (context, prefix) =>
  context?.find((item) => item.id?.startsWith(prefix))?.text || "";

const parseFeature = (feature) => {
  const context = feature?.context || [];
  const postalFromContext = findContextValue(context, "postcode.");
  const cityFromContext =
    findContextValue(context, "place.") ||
    findContextValue(context, "locality.") ||
    findContextValue(context, "district.");

  const postalCode = feature?.place_type?.includes("postcode")
    ? feature?.text || ""
    : postalFromContext;
  const city = feature?.place_type?.includes("place") ? feature?.text || "" : cityFromContext;

  return {
    label: feature?.place_name || "",
    address: buildAddress(feature),
    city,
    postalCode,
  };
};

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  disabled,
  containerClassName,
  inputClassName,
  inputProps,
}) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const cacheRef = useRef(new Map());
  const fetchIdRef = useRef(0);

  const query = useMemo(() => (value || "").trim(), [value]);

  useEffect(() => {
    if (!token || query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(query.toLowerCase());
    if (cached) {
      setSuggestions(cached);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    const handle = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?autocomplete=true&limit=6&types=address&language=de&access_token=${token}`;
        const response = await fetch(url);
        const data = await response.json();
        if (fetchId !== fetchIdRef.current) {
          return;
        }
        const items = Array.isArray(data.features) ? data.features : [];
        cacheRef.current.set(query.toLowerCase(), items);
        setSuggestions(items);
      } catch (error) {
        if (fetchId !== fetchIdRef.current) {
          return;
        }
        setSuggestions([]);
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, token]);

  const handleSelect = (feature) => {
    const parsed = parseFeature(feature);
    onChange(parsed.address);
    if (onSelect) {
      onSelect(parsed);
    }
    setOpen(false);
  };

  const showSuggestions = open && suggestions.length > 0;

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        className={cn("pr-10", inputClassName)}
        {...inputProps}
      />
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
      </div>
      {showSuggestions && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg">
          <ul role="listbox" className="max-h-64 overflow-y-auto py-2">
            {suggestions.map((feature) => {
              const key = feature.id || feature.place_name;
              return (
                <li key={key} role="option" className="px-2">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(feature)}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                    <span className="text-slate-800">{feature.place_name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
