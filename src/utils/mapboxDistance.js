const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const geocodeCache = new Map();
const routeCache = new Map();

const normalizeText = (value) => (value || "").trim().toLowerCase();

const buildAddress = (address, postalCode, city) =>
  [address, postalCode, city].filter(Boolean).join(", ").trim();

const geocodeAddress = async (query) => {
  const normalized = normalizeText(query);
  if (!normalized) return null;
  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized);
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?limit=1&types=address&language=de&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Mapbox-Geocoding fehlgeschlagen.");
  }
  const data = await response.json();
  const coords = data?.features?.[0]?.center || null;
  if (coords) {
    geocodeCache.set(normalized, coords);
  }
  return coords;
};

const buildRouteKey = (start, end) =>
  `${start[0].toFixed(5)},${start[1].toFixed(5)}:${end[0].toFixed(5)},${end[1].toFixed(5)}`;

export const getMapboxDistanceKm = async ({
  pickupAddress,
  pickupCity,
  pickupPostalCode,
  dropoffAddress,
  dropoffCity,
  dropoffPostalCode,
}) => {
  if (!MAPBOX_TOKEN) {
    throw new Error("Mapbox-Token fehlt.");
  }

  const from = buildAddress(pickupAddress, pickupPostalCode, pickupCity);
  const to = buildAddress(dropoffAddress, dropoffPostalCode, dropoffCity);
  if (!from || !to) {
    return null;
  }

  const start = await geocodeAddress(from);
  const end = await geocodeAddress(to);
  if (!start || !end) {
    return null;
  }

  const routeKey = buildRouteKey(start, end);
  if (routeCache.has(routeKey)) {
    return routeCache.get(routeKey);
  }

  const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.join(
    ","
  )};${end.join(",")}?overview=false&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(directionsUrl);
  if (!response.ok) {
    throw new Error("Mapbox-Routen konnten nicht geladen werden.");
  }
  const data = await response.json();
  const distanceMeters = data?.routes?.[0]?.distance;
  if (typeof distanceMeters !== "number") {
    return null;
  }
  const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
  routeCache.set(routeKey, distanceKm);
  return distanceKm;
};
