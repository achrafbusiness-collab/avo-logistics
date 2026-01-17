import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const formatCurrency = (value) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd.MM.yyyy HH:mm", { locale: de });
};

const buildSearchBlob = (segment) => {
  const order = segment.order || {};
  const driver = segment.driver || {};
  return [
    segment.driver_name,
    driver.first_name,
    driver.last_name,
    driver.email,
    order.order_number,
    order.license_plate,
    segment.start_location,
    segment.end_location,
    order.pickup_city,
    order.dropoff_city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export default function DriverPriceRequests() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [priceEdits, setPriceEdits] = useState({});
  const [priceErrors, setPriceErrors] = useState({});
  const [saving, setSaving] = useState({});

  const { data: segments = [], isLoading, error } = useQuery({
    queryKey: ["driver-price-requests"],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("order_segments")
        .select(
          `
          id,
          order_id,
          driver_id,
          driver_name,
          segment_type,
          start_location,
          end_location,
          distance_km,
          created_date,
          price,
          order:orders (
            id,
            order_number,
            license_plate,
            pickup_city,
            dropoff_city
          ),
          driver:drivers (
            id,
            first_name,
            last_name,
            email
          )
        `
        )
        .is("price", null)
        .order("created_date", { ascending: false })
        .limit(500);
      if (queryError) {
        throw new Error(queryError.message);
      }
      return data || [];
    },
  });

  const filteredSegments = useMemo(() => {
    if (!searchTerm.trim()) return segments;
    const term = searchTerm.trim().toLowerCase();
    return segments.filter((segment) => buildSearchBlob(segment).includes(term));
  }, [segments, searchTerm]);

  const handlePriceChange = (segmentId, value) => {
    setPriceEdits((prev) => ({ ...prev, [segmentId]: value }));
  };

  const saveSegmentPrice = async (segment) => {
    const rawValue = priceEdits[segment.id];
    const parsed =
      rawValue === "" || rawValue === null || rawValue === undefined
        ? null
        : parseFloat(rawValue);
    if (parsed === null || Number.isNaN(parsed)) {
      setPriceErrors((prev) => ({
        ...prev,
        [segment.id]: "Bitte einen gültigen Preis eingeben.",
      }));
      return;
    }
    setSaving((prev) => ({ ...prev, [segment.id]: true }));
    setPriceErrors((prev) => ({ ...prev, [segment.id]: "" }));
    try {
      await appClient.entities.OrderSegment.update(segment.id, { price: parsed });
      setPriceEdits((prev) => ({ ...prev, [segment.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["driver-price-requests"] });
      queryClient.invalidateQueries({ queryKey: ["order-segments"], exact: false });
    } catch (err) {
      setPriceErrors((prev) => ({
        ...prev,
        [segment.id]: err?.message || "Preis konnte nicht gespeichert werden.",
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [segment.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fahrer Preis Anfragen</h1>
          <p className="text-gray-500">
            {segments.length} offene Teilstrecken ohne Preis
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={createPageUrl("Orders")}>Zurück zu Aufträgen</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Suche nach Auftrag, Kennzeichen, Fahrer, Ort..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offene Fahrpreis-Anfragen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error.message}</p>
          ) : filteredSegments.length === 0 ? (
            <p className="text-sm text-gray-500">Keine offenen Anfragen.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fahrer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Auftrag</TableHead>
                    <TableHead>Kennzeichen</TableHead>
                    <TableHead>Strecke</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSegments.map((segment) => {
                    const order = segment.order || {};
                    const driver = segment.driver || {};
                    const driverLabel =
                      segment.driver_name ||
                      [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
                      driver.email ||
                      "Fahrer";
                    const routeLabel = `${segment.start_location || "-"} → ${
                      segment.end_location || "-"
                    }`;
                    return (
                      <TableRow key={segment.id}>
                        <TableCell className="font-medium">{driverLabel}</TableCell>
                        <TableCell className="text-sm text-gray-600">{routeLabel}</TableCell>
                        <TableCell>
                          {order.order_number ? (
                            <Link
                              to={createPageUrl("Orders") + `?id=${segment.order_id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {order.order_number}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{order.license_plate || "-"}</TableCell>
                        <TableCell>
                          {segment.distance_km !== null && segment.distance_km !== undefined
                            ? `${segment.distance_km} km`
                            : "-"}
                        </TableCell>
                        <TableCell>{formatDateTime(segment.created_date)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={priceEdits[segment.id] ?? ""}
                              onChange={(event) =>
                                handlePriceChange(segment.id, event.target.value)
                              }
                              placeholder="Preis (€)"
                              className="w-32 text-right"
                            />
                            <Button
                              size="sm"
                              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                              disabled={saving[segment.id]}
                              onClick={() => saveSegmentPrice(segment)}
                            >
                              {saving[segment.id] ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Bestätigen
                            </Button>
                            {priceErrors[segment.id] ? (
                              <p className="text-xs text-red-600">
                                {priceErrors[segment.id]}
                              </p>
                            ) : null}
                            {segment.price !== null && segment.price !== undefined ? (
                              <p className="text-xs text-gray-500">
                                Aktuell: {formatCurrency(segment.price)}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
