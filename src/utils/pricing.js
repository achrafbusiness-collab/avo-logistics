const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeTier = (tier) => ({
  id: tier.id,
  min_km: toNumber(tier.min_km) ?? 0,
  max_km: toNumber(tier.max_km),
  customer_price: toNumber(tier.customer_price),
});

export const findTierForDistance = (tiers, distanceKm) => {
  const distance = toNumber(distanceKm);
  if (!Number.isFinite(distance)) return null;
  const normalized = (tiers || []).map(normalizeTier).sort((a, b) => a.min_km - b.min_km);
  return (
    normalized.find((tier) => {
      const withinMin = distance >= (tier.min_km ?? 0);
      const withinMax = tier.max_km === null || distance <= tier.max_km;
      return withinMin && withinMax;
    }) || null
  );
};

export const calculatePricing = (tiers, distanceKm) => {
  const tier = findTierForDistance(tiers, distanceKm);
  if (!tier) return null;
  return {
    pricing_tier_id: tier.id,
    customer_price: tier.customer_price ?? null,
  };
};

export const formatKm = (value) => {
  const parsed = toNumber(value);
  return parsed === null ? '' : parsed.toString();
};
