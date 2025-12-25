import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertTriangle, MapPin } from "lucide-react";

const GEOCODE_CACHE_KEY = "avo:mapbox-geocode-cache";
const ROUTE_CACHE_KEY = "avo:mapbox-route-cache";

const memoryCache = {
  geocode: {},
  routes: {},
};

const readCache = (key, fallback) => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const writeCache = (key, value) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage write errors.
  }
};

const getGeocodeCache = () => {
  if (!memoryCache.geocode._loaded) {
    memoryCache.geocode = readCache(GEOCODE_CACHE_KEY, {});
    memoryCache.geocode._loaded = true;
  }
  return memoryCache.geocode;
};

const getRouteCache = () => {
  if (!memoryCache.routes._loaded) {
    memoryCache.routes = readCache(ROUTE_CACHE_KEY, {});
    memoryCache.routes._loaded = true;
  }
  return memoryCache.routes;
};

const normalizeAddress = (order, type) => {
  if (!order) return "";
  const address = type === "pickup" ? order.pickup_address : order.dropoff_address;
  const city = type === "pickup" ? order.pickup_city : order.dropoff_city;
  const postal = type === "pickup" ? order.pickup_postal_code : order.dropoff_postal_code;
  return [address, postal, city].filter(Boolean).join(", ").trim();
};

const coordKey = (coords) => coords.map((value) => value.toFixed(5)).join(",");

const buildRouteKey = (start, end) => `${coordKey(start)}:${coordKey(end)}`;

const emptyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export default function OrdersMap({ orders, selectedOrderId, onSelectOrder }) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mapOrders = useMemo(() => {
    return (orders || []).filter((order) => {
      const pickup = normalizeAddress(order, "pickup");
      const dropoff = normalizeAddress(order, "dropoff");
      return pickup && dropoff;
    });
  }, [orders]);

  useEffect(() => {
    if (!token || mapRef.current || !mapContainerRef.current) {
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [10.4515, 51.1657],
      zoom: 4,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    const handleLoad = () => {
      map.addSource("orders-points", {
        type: "geojson",
        data: emptyFeatureCollection,
      });
      map.addSource("selected-route", {
        type: "geojson",
        data: emptyFeatureCollection,
      });

      map.addLayer({
        id: "selected-route-line",
        type: "line",
        source: "selected-route",
        paint: {
          "line-color": "#1e3a5f",
          "line-width": 4,
          "line-opacity": 0.75,
        },
      });

      map.addLayer({
        id: "orders-points-layer",
        type: "circle",
        source: "orders-points",
        paint: {
          "circle-radius": 6,
          "circle-color": "#94a3b8",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1,
        },
      });

      setMapReady(true);
    };

    map.on("load", handleLoad);
    mapRef.current = map;

    return () => {
      map.off("load", handleLoad);
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !mapOrders.length) {
      setRoutes([]);
      return;
    }

    let cancelled = false;
    const fetchRoutes = async () => {
      setLoading(true);
      setError("");
      const geocodeCache = getGeocodeCache();
      const routeCache = getRouteCache();
      const results = [];

      for (const order of mapOrders) {
        const pickup = normalizeAddress(order, "pickup");
        const dropoff = normalizeAddress(order, "dropoff");

        if (!pickup || !dropoff) {
          continue;
        }

        const pickupKey = pickup.toLowerCase();
        const dropoffKey = dropoff.toLowerCase();

        let start = geocodeCache[pickupKey];
        let end = geocodeCache[dropoffKey];

        if (!start) {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            pickup
          )}.json?limit=1&access_token=${token}`;
          const response = await fetch(url);
          const data = await response.json();
          const match = data.features?.[0]?.center;
          if (match) {
            start = match;
            geocodeCache[pickupKey] = match;
          }
        }

        if (!end) {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            dropoff
          )}.json?limit=1&access_token=${token}`;
          const response = await fetch(url);
          const data = await response.json();
          const match = data.features?.[0]?.center;
          if (match) {
            end = match;
            geocodeCache[dropoffKey] = match;
          }
        }

        if (!start || !end) {
          continue;
        }

        const routeKey = buildRouteKey(start, end);
        let geometry = routeCache[routeKey];

        if (!geometry) {
          const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.join(
            ","
          )};${end.join(",")}?geometries=geojson&overview=full&access_token=${token}`;
          const response = await fetch(directionsUrl);
          const data = await response.json();
          geometry = data.routes?.[0]?.geometry || null;
          if (geometry) {
            routeCache[routeKey] = geometry;
          }
        }

        results.push({
          order,
          start,
          end,
          geometry,
        });
      }

      writeCache(GEOCODE_CACHE_KEY, geocodeCache);
      writeCache(ROUTE_CACHE_KEY, routeCache);

      if (!cancelled) {
        setRoutes(results);
      }
      setLoading(false);
    };

    fetchRoutes().catch((err) => {
      if (!cancelled) {
        setError("Mapbox-Routen konnten nicht geladen werden.");
        setLoading(false);
      }
      console.error(err);
    });

    return () => {
      cancelled = true;
    };
  }, [mapOrders, token]);

  const pointsData = useMemo(() => {
    if (!routes.length) return emptyFeatureCollection;
    return {
      type: "FeatureCollection",
      features: routes.flatMap((route) => [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: route.start,
          },
          properties: {
            orderId: route.order.id,
            type: "pickup",
          },
        },
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: route.end,
          },
          properties: {
            orderId: route.order.id,
            type: "dropoff",
          },
        },
      ]),
    };
  }, [routes]);

  const selectedRoute = useMemo(() => {
    if (!routes.length) return null;
    return routes.find((route) => route.order.id === selectedOrderId) || routes[0];
  }, [routes, selectedOrderId]);

  const selectedRouteData = useMemo(() => {
    if (!selectedRoute) return emptyFeatureCollection;
    const geometry =
      selectedRoute.geometry || {
        type: "LineString",
        coordinates: [selectedRoute.start, selectedRoute.end],
      };
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry,
          properties: {},
        },
      ],
    };
  }, [selectedRoute]);

  useEffect(() => {
    if (!routes.length || !onSelectOrder) {
      return;
    }
    if (!selectedOrderId || !routes.some((route) => route.order.id === selectedOrderId)) {
      onSelectOrder(routes[0].order.id);
    }
  }, [routes, selectedOrderId, onSelectOrder]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const pointsSource = map.getSource("orders-points");
    const routeSource = map.getSource("selected-route");

    if (pointsSource) {
      pointsSource.setData(pointsData);
    }
    if (routeSource) {
      routeSource.setData(selectedRouteData);
    }

    const highlight = selectedRoute?.order?.id || "";
    if (map.getLayer("orders-points-layer")) {
      map.setPaintProperty("orders-points-layer", "circle-color", [
        "case",
        ["==", ["get", "orderId"], highlight],
        ["match", ["get", "type"], "pickup", "#2563eb", "dropoff", "#0f172a", "#2563eb"],
        ["match", ["get", "type"], "pickup", "#94a3b8", "dropoff", "#64748b", "#94a3b8"],
      ]);
      map.setPaintProperty("orders-points-layer", "circle-radius", [
        "case",
        ["==", ["get", "orderId"], highlight],
        8,
        6,
      ]);
    }
  }, [mapReady, pointsData, selectedRouteData, selectedRoute]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !pointsData.features.length) return;
    const map = mapRef.current;
    const bounds = new mapboxgl.LngLatBounds();
    pointsData.features.forEach((feature) => {
      bounds.extend(feature.geometry.coordinates);
    });
    map.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 12 });
  }, [mapReady, pointsData]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const handleClick = (event) => {
      const orderId = event.features?.[0]?.properties?.orderId;
      if (orderId && onSelectOrder) {
        onSelectOrder(orderId);
      }
    };

    map.on("click", "orders-points-layer", handleClick);
    map.on("mouseenter", "orders-points-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "orders-points-layer", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.off("click", "orders-points-layer", handleClick);
    };
  }, [mapReady, onSelectOrder]);

  if (!token) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-medium text-slate-700">Mapbox Token fehlt</p>
        <p className="mt-1 text-xs text-slate-500">
          Setze VITE_MAPBOX_TOKEN in deinen Env-Variablen, um die Karte zu aktivieren.
        </p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
        <MapPin className="h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700">Keine Routen im Zeitraum</p>
        <p className="mt-1 text-xs text-slate-500">Es liegen noch keine Aufträge mit Adressen vor.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={mapContainerRef} className="absolute inset-0" />
      {(loading || error) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4 text-center text-sm text-slate-600">
          {error ? error : "Routen werden geladen..."}
        </div>
      )}
      {!loading && !routes.length && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4 text-center text-sm text-slate-600">
          Keine Adressen fuer die Kartenansicht gefunden.
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-10 rounded-full border border-white/50 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm">
        Mapbox Karte
      </div>
    </div>
  );
}
