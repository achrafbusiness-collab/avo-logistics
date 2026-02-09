import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const getSegmentStatus = (segment) => {
  if (segment.price_status) return segment.price_status;
  if (segment.price !== null && segment.price !== undefined) return "approved";
  return "pending";
};

export default function DriverPriceRequests() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateSort, setDateSort] = useState("desc");
  const [priceEdits, setPriceEdits] = useState({});
  const [priceErrors, setPriceErrors] = useState({});
  const [saving, setSaving] = useState({});
  const [rejectEdits, setRejectEdits] = useState({});
  const [rejectErrors, setRejectErrors] = useState({});
  const [rejecting, setRejecting] = useState({});
  const [rejectOpen, setRejectOpen] = useState({});
  const priceInputRefs = useRef({});

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
          updated_date,
          price,
          price_status,
          price_rejection_reason,
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
        .order("created_date", { ascending: false })
        .limit(500);
      if (queryError) {
        throw new Error(queryError.message);
      }
      return data || [];
    },
  });

  const pendingSegments = useMemo(
    () => segments.filter((segment) => getSegmentStatus(segment) === "pending"),
    [segments]
  );

  const filteredSegments = useMemo(() => {
    if (!searchTerm.trim()) return pendingSegments;
    const term = searchTerm.trim().toLowerCase();
    return pendingSegments.filter((segment) => buildSearchBlob(segment).includes(term));
  }, [pendingSegments, searchTerm]);

  const sortedSegments = useMemo(() => {
    const direction = dateSort === "asc" ? 1 : -1;
    return [...filteredSegments].sort((a, b) => {
      const aDate = a?.created_date ? new Date(a.created_date) : null;
      const bDate = b?.created_date ? new Date(b.created_date) : null;
      const aValid = aDate && !Number.isNaN(aDate.getTime());
      const bValid = bDate && !Number.isNaN(bDate.getTime());
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return (aDate.getTime() - bDate.getTime()) * direction;
    });
  }, [filteredSegments, dateSort]);

  const recentAdjustedSegments = useMemo(() => {
    return segments
      .filter((segment) => {
        const status = getSegmentStatus(segment);
        return (
          status === "approved" &&
          segment.price !== null &&
          segment.price !== undefined
        );
      })
      .sort((a, b) => {
        const aDate = a?.updated_date
          ? new Date(a.updated_date)
          : a?.created_date
            ? new Date(a.created_date)
            : null;
        const bDate = b?.updated_date
          ? new Date(b.updated_date)
          : b?.created_date
            ? new Date(b.created_date)
            : null;
        const aValid = aDate && !Number.isNaN(aDate.getTime());
        const bValid = bDate && !Number.isNaN(bDate.getTime());
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        return bDate.getTime() - aDate.getTime();
      })
      .slice(0, 3);
  }, [segments]);

  const handlePriceChange = (segmentId, value) => {
    setPriceEdits((prev) => ({ ...prev, [segmentId]: value }));
  };

  const saveSegmentPrice = async (segment, options = {}) => {
    const allowCurrentPriceFallback = options.allowCurrentPriceFallback === true;
    const rawValue = priceEdits[segment.id];
    const parsed =
      rawValue === "" || rawValue === null || rawValue === undefined
        ? allowCurrentPriceFallback &&
            segment.price !== null &&
            segment.price !== undefined
          ? Number(segment.price)
          : null
        : parseFloat(rawValue);
    if (parsed === null || Number.isNaN(parsed)) {
      setPriceErrors((prev) => ({
        ...prev,
        [segment.id]: "Bitte einen gültigen Preis eingeben.",
      }));
      return false;
    }
    setSaving((prev) => ({ ...prev, [segment.id]: true }));
    setPriceErrors((prev) => ({ ...prev, [segment.id]: "" }));
    try {
      await appClient.entities.OrderSegment.update(segment.id, {
        price: parsed,
        price_status: "approved",
        price_rejection_reason: null,
      });
      setPriceEdits((prev) => {
        const next = { ...prev };
        delete next[segment.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["driver-price-requests"] });
      queryClient.invalidateQueries({ queryKey: ["order-segments"], exact: false });
      return true;
    } catch (err) {
      setPriceErrors((prev) => ({
        ...prev,
        [segment.id]: err?.message || "Preis konnte nicht gespeichert werden.",
      }));
      return false;
    } finally {
      setSaving((prev) => ({ ...prev, [segment.id]: false }));
    }
  };

  const handleRejectChange = (segmentId, value) => {
    setRejectEdits((prev) => ({ ...prev, [segmentId]: value }));
  };

  const toggleRejectOpen = (segmentId) => {
    setRejectOpen((prev) => ({ ...prev, [segmentId]: !prev[segmentId] }));
  };

  const rejectSegment = async (segment) => {
    const reason = (rejectEdits[segment.id] || "").trim();
    if (!reason) {
      setRejectErrors((prev) => ({
        ...prev,
        [segment.id]: "Bitte einen kurzen Ablehnungsgrund angeben.",
      }));
      setRejectOpen((prev) => ({ ...prev, [segment.id]: true }));
      return false;
    }
    setRejecting((prev) => ({ ...prev, [segment.id]: true }));
    setRejectErrors((prev) => ({ ...prev, [segment.id]: "" }));
    try {
      await appClient.entities.OrderSegment.update(segment.id, {
        price: null,
        price_status: "rejected",
        price_rejection_reason: reason,
      });
      setRejectEdits((prev) => ({ ...prev, [segment.id]: "" }));
      setRejectOpen((prev) => ({ ...prev, [segment.id]: false }));
      queryClient.invalidateQueries({ queryKey: ["driver-price-requests"] });
      queryClient.invalidateQueries({ queryKey: ["order-segments"], exact: false });
      return true;
    } catch (err) {
      setRejectErrors((prev) => ({
        ...prev,
        [segment.id]: err?.message || "Ablehnung konnte nicht gespeichert werden.",
      }));
      return false;
    } finally {
      setRejecting((prev) => ({ ...prev, [segment.id]: false }));
    }
  };

  const focusNextPriceInput = (segmentId) => {
    const ids = sortedSegments.map((item) => item.id);
    const index = ids.indexOf(segmentId);
    const nextId = index >= 0 ? ids[index + 1] : null;
    if (!nextId) return;
    requestAnimationFrame(() => {
      priceInputRefs.current[nextId]?.focus();
    });
  };

  const handleApproveAndFocus = async (segment) => {
    const ok = await saveSegmentPrice(segment);
    if (ok) {
      focusNextPriceInput(segment.id);
    }
  };

  const handleRejectAndFocus = async (segment) => {
    const ok = await rejectSegment(segment);
    if (ok) {
      focusNextPriceInput(segment.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fahrer Preis Anfragen</h1>
          <p className="text-gray-500">
            {pendingSegments.length} offene Anfragen
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={createPageUrl("Orders")}>Zurück zu Aufträgen</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Suche nach Auftrag, Kennzeichen, Fahrer, Ort..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Select value={dateSort} onValueChange={setDateSort}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Datum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Anfrage: neu → alt</SelectItem>
                <SelectItem value="asc">Anfrage: alt → neu</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fahrpreis-Anfragen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error.message}</p>
          ) : sortedSegments.length === 0 ? (
            <p className="text-sm text-gray-500">Keine offenen Anfragen.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fahrer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Auftrag</TableHead>
                    <TableHead>Kennzeichen</TableHead>
                    <TableHead>Strecke</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSegments.map((segment) => {
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
                    const typeLabel = segment.segment_type === "shuttle" ? "Shuttle" : "Aktive Tour";
                    return (
                      <TableRow key={segment.id}>
                        <TableCell className="font-medium">{driverLabel}</TableCell>
                        <TableCell className="text-sm text-gray-600">{routeLabel}</TableCell>
                        <TableCell className="text-sm text-gray-600">{typeLabel}</TableCell>
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
                              ref={(node) => {
                                if (node) {
                                  priceInputRefs.current[segment.id] = node;
                                }
                              }}
                              onChange={(event) =>
                                handlePriceChange(segment.id, event.target.value)
                              }
                              onKeyDown={async (event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  await handleApproveAndFocus(segment);
                                }
                              }}
                              placeholder="Preis (€)"
                              className="w-32 text-right"
                            />
                            <Button
                              size="sm"
                              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                              disabled={saving[segment.id]}
                              onClick={() => handleApproveAndFocus(segment)}
                            >
                              {saving[segment.id] ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Bestätigen
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => toggleRejectOpen(segment.id)}
                            >
                              Ablehnen
                            </Button>
                            {rejectOpen[segment.id] ? (
                              <div className="w-64 space-y-2 text-left">
                                <Textarea
                                  rows={3}
                                  placeholder="Kurz begründen..."
                                  value={rejectEdits[segment.id] ?? ""}
                                  onChange={(event) =>
                                    handleRejectChange(segment.id, event.target.value)
                                  }
                                />
                                <Button
                                  size="sm"
                                  className="bg-red-600 hover:bg-red-700"
                                  disabled={rejecting[segment.id]}
                                  onClick={() => handleRejectAndFocus(segment)}
                                >
                                  {rejecting[segment.id] ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Ablehnung speichern
                                </Button>
                              </div>
                            ) : null}
                            {priceErrors[segment.id] ? (
                              <p className="text-xs text-red-600">
                                {priceErrors[segment.id]}
                              </p>
                            ) : null}
                            {rejectErrors[segment.id] ? (
                              <p className="text-xs text-red-600">
                                {rejectErrors[segment.id]}
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

      <Card>
        <CardHeader>
          <CardTitle>Letzte 3 angepasste Anfragen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error.message}</p>
          ) : recentAdjustedSegments.length === 0 ? (
            <p className="text-sm text-gray-500">
              Noch keine angepassten Anfragen vorhanden.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fahrer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Auftrag</TableHead>
                    <TableHead>Kennzeichen</TableHead>
                    <TableHead>Zuletzt angepasst</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAdjustedSegments.map((segment) => {
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
                    const adjustedAt = segment.updated_date || segment.created_date;
                    return (
                      <TableRow key={`recent-${segment.id}`}>
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
                        <TableCell>{formatDateTime(adjustedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={priceEdits[segment.id] ?? String(segment.price ?? "")}
                              onChange={(event) =>
                                handlePriceChange(segment.id, event.target.value)
                              }
                              onKeyDown={async (event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  await saveSegmentPrice(segment, {
                                    allowCurrentPriceFallback: true,
                                  });
                                }
                              }}
                              placeholder="Preis (€)"
                              className="w-32 text-right"
                            />
                            <Button
                              size="sm"
                              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                              disabled={saving[segment.id]}
                              onClick={() =>
                                saveSegmentPrice(segment, {
                                  allowCurrentPriceFallback: true,
                                })
                              }
                            >
                              {saving[segment.id] ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Preis aktualisieren
                            </Button>
                            {priceErrors[segment.id] ? (
                              <p className="text-xs text-red-600">
                                {priceErrors[segment.id]}
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
