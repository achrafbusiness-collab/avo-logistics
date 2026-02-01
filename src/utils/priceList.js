const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizePriceList = (rows) => {
  if (!Array.isArray(rows)) return [];
  const cleaned = rows
    .map((row) => ({
      min_km: toNumberOrNull(row.min_km),
      max_km: toNumberOrNull(row.max_km),
      price: toNumberOrNull(row.price),
    }))
    .filter((row) => row.min_km !== null && row.price !== null)
    .map((row) => ({
      ...row,
      max_km:
        row.max_km !== null && row.max_km >= row.min_km ? row.max_km : null,
    }));

  return cleaned.sort((a, b) => a.min_km - b.min_km);
};

export const getPriceForDistance = (rows, distanceKm) => {
  const distance = toNumberOrNull(distanceKm);
  if (distance === null) return null;
  const normalized = normalizePriceList(rows);
  if (!normalized.length) return null;
  const match = normalized.find((row) => {
    if (distance < row.min_km) return false;
    if (row.max_km === null) return true;
    return distance <= row.max_km;
  });
  return match ? match.price : null;
};

export const buildEmptyPriceRow = () => ({
  min_km: "",
  max_km: "",
  price: "",
});

