import { describe, it, expect } from 'vitest';
import { normalizePriceList, getPriceForDistance, buildEmptyPriceRow } from './priceList';

describe('normalizePriceList', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizePriceList(null)).toEqual([]);
    expect(normalizePriceList(undefined)).toEqual([]);
    expect(normalizePriceList('test')).toEqual([]);
  });

  it('filters out rows without min_km or price', () => {
    const rows = [
      { min_km: 0, max_km: 100, price: 50 },
      { min_km: null, max_km: 200, price: 100 },
      { min_km: 100, max_km: 200, price: null },
    ];
    const result = normalizePriceList(rows);
    expect(result).toHaveLength(1);
    expect(result[0].min_km).toBe(0);
  });

  it('sorts by min_km ascending', () => {
    const rows = [
      { min_km: 200, max_km: 300, price: 150 },
      { min_km: 0, max_km: 100, price: 50 },
      { min_km: 100, max_km: 200, price: 100 },
    ];
    const result = normalizePriceList(rows);
    expect(result.map(r => r.min_km)).toEqual([0, 100, 200]);
  });

  it('sets max_km to null if less than min_km', () => {
    const rows = [{ min_km: 100, max_km: 50, price: 80 }];
    const result = normalizePriceList(rows);
    expect(result[0].max_km).toBeNull();
  });

  it('parses string numbers correctly', () => {
    const rows = [{ min_km: '0', max_km: '100', price: '49.99' }];
    const result = normalizePriceList(rows);
    expect(result[0]).toEqual({ min_km: 0, max_km: 100, price: 49.99 });
  });
});

describe('getPriceForDistance', () => {
  const priceList = [
    { min_km: 0, max_km: 100, price: 50 },
    { min_km: 100, max_km: 200, price: 80 },
    { min_km: 200, max_km: null, price: 120 },
  ];

  it('returns correct price for distance in first range', () => {
    expect(getPriceForDistance(priceList, 50)).toBe(50);
  });

  it('returns correct price for distance in middle range', () => {
    expect(getPriceForDistance(priceList, 150)).toBe(80);
  });

  it('returns correct price for distance in open-ended range', () => {
    expect(getPriceForDistance(priceList, 500)).toBe(120);
  });

  it('returns correct price at exact boundary (100km is still in 0-100 range)', () => {
    expect(getPriceForDistance(priceList, 100)).toBe(50);
  });

  it('returns correct price at zero distance', () => {
    expect(getPriceForDistance(priceList, 0)).toBe(50);
  });

  it('returns null for null distance', () => {
    expect(getPriceForDistance(priceList, null)).toBeNull();
  });

  it('returns null for empty price list', () => {
    expect(getPriceForDistance([], 50)).toBeNull();
  });

  it('handles string distance values', () => {
    expect(getPriceForDistance(priceList, '150')).toBe(80);
  });
});

describe('buildEmptyPriceRow', () => {
  it('returns row with empty strings', () => {
    expect(buildEmptyPriceRow()).toEqual({ min_km: '', max_km: '', price: '' });
  });
});
