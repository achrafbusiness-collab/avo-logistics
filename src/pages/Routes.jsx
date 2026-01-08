import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, endOfDay, isBefore, isSameDay, startOfDay, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { appClient } from "@/api/appClient";
import OrdersMap from "@/components/dashboard/OrdersMap";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Route, Filter } from "lucide-react";

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return format(date, "dd.MM.yyyy", { locale: de });
};

const formatDateTime = (date, time) => {
  if (!date) return "-";
  if (!time) return formatDate(date);
  return `${formatDate(date)} ${time}`;
};

export default function Routes() {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const geocodeCache = useRef({});
  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState(todayKey);
  const [dateTo, setDateTo] = useState(todayKey);
  const [quickRange, setQuickRange] = useState("today");
  const [statusMode, setStatusMode] = useState("open");
  const [onlyDue, setOnlyDue] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const [distanceStartMode, setDistanceStartMode] = useState("order");
  const [distanceEndMode, setDistanceEndMode] = useState("order");
  const [distanceStartOrder, setDistanceStartOrder] = useState("");
  const [distanceEndOrder, setDistanceEndOrder] = useState("");
  const [distanceStartAddress, setDistanceStartAddress] = useState("");
  const [distanceEndAddress, setDistanceEndAddress] = useState("");
  const [distanceMode, setDistanceMode] = useState("driving");
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState("");
  const [distanceResult, setDistanceResult] = useState(null);
  const [distanceRoute, setDistanceRoute] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: () => appClient.entities.Order.list("-created_date", 500),
  });

  const { rangeStart, rangeEnd } = useMemo(() => {
    let start = dateFrom ? startOfDay(new Date(dateFrom)) : null;
    let end = dateTo ? endOfDay(new Date(dateTo)) : null;
    if (start && end && start > end) {
      [start, end] = [end, start];
    }
    return { rangeStart: start, rangeEnd: end };
  }, [dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const pickupDate = toDate(order.pickup_date);
      const dropoffDate = toDate(order.dropoff_date);
      const orderDate = pickupDate || dropoffDate || toDate(order.created_date);
      if (rangeStart && orderDate && orderDate < rangeStart) return false;
      if (rangeEnd && orderDate && orderDate > rangeEnd) return false;
      if (statusMode === "open" && order.status === "completed") return false;
      if (statusMode === "completed" && order.status !== "completed") return false;
      if (onlyDue) {
        const dueDate = dropoffDate || pickupDate;
        if (!dueDate) return false;
        if (!(isSameDay(dueDate, today) || isBefore(dueDate, today))) return false;
      }
      if (!term) return true;
      const matches = [
        order.order_number,
        order.license_plate,
        order.vin,
        order.pickup_city,
        order.pickup_postal_code,
        order.pickup_address,
        order.dropoff_city,
        order.dropoff_postal_code,
        order.dropoff_address,
        order.customer_name,
        order.assigned_driver_name,
        order.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
      return matches;
    });
  }, [orders, searchTerm, statusMode, onlyDue, rangeStart, rangeEnd, today]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const aDate = toDate(a.pickup_date) || toDate(a.dropoff_date) || toDate(a.created_date);
      const bDate = toDate(b.pickup_date) || toDate(b.dropoff_date) || toDate(b.created_date);
      if (!aDate || !bDate) return 0;
      return aDate - bDate;
    });
  }, [filteredOrders]);

  useEffect(() => {
    if (!sortedOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !sortedOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(sortedOrders[0].id);
    }
  }, [sortedOrders, selectedOrderId]);

  const selectedOrder = sortedOrders.find((order) => order.id === selectedOrderId);

  const applyQuickRange = (key) => {
    setQuickRange(key);
    if (key === "today") {
      const value = format(today, "yyyy-MM-dd");
      setDateFrom(value);
      setDateTo(value);
    } else if (key === "yesterday") {
      const value = format(subDays(today, 1), "yyyy-MM-dd");
      setDateFrom(value);
      setDateTo(value);
    } else if (key === "dayBefore") {
      const value = format(subDays(today, 2), "yyyy-MM-dd");
      setDateFrom(value);
      setDateTo(value);
    } else if (key === "tomorrow") {
      const value = format(addDays(today, 1), "yyyy-MM-dd");
      setDateFrom(value);
      setDateTo(value);
    }
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setStatusMode("open");
    setOnlyDue(true);
    applyQuickRange("today");
  };

  const orderOptions = useMemo(() => {
    return orders.flatMap((order) => {
      const pickupLabel = [order.pickup_address, order.pickup_postal_code, order.pickup_city]
        .filter(Boolean)
        .join(", ");
      const dropoffLabel = [order.dropoff_address, order.dropoff_postal_code, order.dropoff_city]
        .filter(Boolean)
        .join(", ");
      const base = `${order.order_number || "Auftrag"}`;
      const options = [];
      if (pickupLabel) {
        options.push({
          value: `${order.id}:pickup`,
          label: `${base} • Abholung`,
          address: pickupLabel,
        });
      }
      if (dropoffLabel) {
        options.push({
          value: `${order.id}:dropoff`,
          label: `${base} • Abgabe`,
          address: dropoffLabel,
        });
      }
      return options;
    });
  }, [orders]);

  const geocodeAddress = async (address) => {
    if (!token) throw new Error("Mapbox Token fehlt.");
    const key = address.toLowerCase();
    if (geocodeCache.current[key]) {
      return geocodeCache.current[key];
    }
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address
    )}.json?limit=1&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json();
    const coords = data.features?.[0]?.center;
    if (!coords) {
      throw new Error("Adresse nicht gefunden.");
    }
    geocodeCache.current[key] = coords;
    return coords;
  };

  const resolveDistanceAddress = (mode, selection, fallback) => {
    if (mode === "address") return fallback;
    const option = orderOptions.find((item) => item.value === selection);
    return option?.address || "";
  };

  const handleDistanceCheck = async () => {
    setDistanceError("");
    setDistanceResult(null);
    setDistanceRoute(null);
    const startAddress = resolveDistanceAddress(
      distanceStartMode,
      distanceStartOrder,
      distanceStartAddress
    );
    const endAddress = resolveDistanceAddress(
      distanceEndMode,
      distanceEndOrder,
      distanceEndAddress
    );
    if (!startAddress || !endAddress) {
      setDistanceError("Bitte Start- und Zielpunkt angeben.");
      return;
    }
    setDistanceLoading(true);
    try {
      const start = await geocodeAddress(startAddress);
      const end = await geocodeAddress(endAddress);
      const url = `https://api.mapbox.com/directions/v5/mapbox/${distanceMode}/${start.join(
        ","
      )};${end.join(",")}?geometries=geojson&overview=full&access_token=${token}`;
      const response = await fetch(url);
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route) {
        throw new Error("Keine Route gefunden.");
      }
      setDistanceResult({
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMin: Math.round(route.duration / 60),
      });
      setDistanceRoute({ geometry: route.geometry });
    } catch (error) {
      setDistanceError(error.message || "Distanz konnte nicht berechnet werden.");
    } finally {
      setDistanceLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">Routenansicht</h1>
        <p className="text-sm text-slate-500">
          Filter setzen und direkt auf der Karte prüfen.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Suche nach Auftrag, Kennzeichen, Ort, Fahrer, Status..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={statusMode === "open" ? "default" : "outline"}
                className={statusMode === "open" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => setStatusMode("open")}
              >
                Offen
              </Button>
              <Button
                size="sm"
                variant={statusMode === "completed" ? "default" : "outline"}
                className={statusMode === "completed" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => setStatusMode("completed")}
              >
                Abgeschlossen
              </Button>
              <Button
                size="sm"
                variant={statusMode === "all" ? "default" : "outline"}
                className={statusMode === "all" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => setStatusMode("all")}
              >
                Alle
              </Button>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Filter className="w-4 h-4" />
              <span>Zeitraum</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-slate-400">bis</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={quickRange === "dayBefore" ? "default" : "outline"}
                className={quickRange === "dayBefore" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => applyQuickRange("dayBefore")}
              >
                Vorgestern
              </Button>
              <Button
                size="sm"
                variant={quickRange === "yesterday" ? "default" : "outline"}
                className={quickRange === "yesterday" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => applyQuickRange("yesterday")}
              >
                Gestern
              </Button>
              <Button
                size="sm"
                variant={quickRange === "today" ? "default" : "outline"}
                className={quickRange === "today" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => applyQuickRange("today")}
              >
                Heute
              </Button>
              <Button
                size="sm"
                variant={quickRange === "tomorrow" ? "default" : "outline"}
                className={quickRange === "tomorrow" ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => applyQuickRange("tomorrow")}
              >
                Morgen
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={onlyDue ? "default" : "outline"}
                className={onlyDue ? "bg-[#1e3a5f] hover:bg-[#2d5a8a]" : ""}
                onClick={() => setOnlyDue((prev) => !prev)}
              >
                Nur fällige Aufträge
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="min-h-[420px] h-[70vh]">
              <OrdersMap
                orders={sortedOrders}
                selectedOrderId={selectedOrderId}
                onSelectOrder={setSelectedOrderId}
                maxRoutes={20}
                enableClusters
                showPopups
                extraRoute={distanceRoute}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {selectedOrder && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Auftrag Übersicht</p>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-sm text-slate-500">{selectedOrder.order_number} • {selectedOrder.license_plate || "-"}</p>
                <p className="text-sm text-slate-600">
                  {selectedOrder.pickup_city || "Start"} → {selectedOrder.dropoff_city || "Ziel"}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>Abholung: {formatDateTime(selectedOrder.pickup_date, selectedOrder.pickup_time)}</span>
                  <span>Lieferung: {formatDateTime(selectedOrder.dropoff_date, selectedOrder.dropoff_time)}</span>
                  {selectedOrder.assigned_driver_name && <span>Fahrer: {selectedOrder.assigned_driver_name}</span>}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Route className="w-4 h-4" />
                Distanz prüfen
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Select value={distanceStartMode} onValueChange={setDistanceStartMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Startpunkt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order">Aus Auftrag wählen</SelectItem>
                      <SelectItem value="address">Adresse eingeben</SelectItem>
                    </SelectContent>
                  </Select>
                  {distanceStartMode === "order" ? (
                    <Select value={distanceStartOrder} onValueChange={setDistanceStartOrder}>
                      <SelectTrigger>
                        <SelectValue placeholder="Start aus Auftrag" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={distanceStartAddress}
                      onChange={(event) => setDistanceStartAddress(event.target.value)}
                      placeholder="Startadresse oder PLZ"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Select value={distanceEndMode} onValueChange={setDistanceEndMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Zielpunkt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order">Aus Auftrag wählen</SelectItem>
                      <SelectItem value="address">Adresse eingeben</SelectItem>
                    </SelectContent>
                  </Select>
                  {distanceEndMode === "order" ? (
                    <Select value={distanceEndOrder} onValueChange={setDistanceEndOrder}>
                      <SelectTrigger>
                        <SelectValue placeholder="Ziel aus Auftrag" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={distanceEndAddress}
                      onChange={(event) => setDistanceEndAddress(event.target.value)}
                      placeholder="Zieladresse oder PLZ"
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Select value={distanceMode} onValueChange={setDistanceMode}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Transportmodus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driving">Auto</SelectItem>
                    <SelectItem value="driving-traffic">Auto (Live Verkehr)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={handleDistanceCheck}
                  disabled={distanceLoading}
                >
                  {distanceLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Distanz prüfen
                </Button>
              </div>

              {distanceError && (
                <p className="text-sm text-red-600">{distanceError}</p>
              )}
              {distanceResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Distanz: <strong>{distanceResult.distanceKm} km</strong> • Dauer:{" "}
                  <strong>{distanceResult.durationMin} min</strong>
                </div>
              )}
              {!token && (
                <p className="text-xs text-amber-600">
                  Mapbox Token fehlt – Distanzprüfung ist deaktiviert.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
