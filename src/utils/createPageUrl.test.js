import { describe, it, expect } from 'vitest';
import { createPageUrl } from './index';

describe('createPageUrl', () => {
  it('converts page name to lowercase path', () => {
    expect(createPageUrl('Dashboard')).toBe('/dashboard');
  });

  it('replaces spaces with hyphens', () => {
    expect(createPageUrl('Driver Orders')).toBe('/driver-orders');
  });

  it('handles already lowercase names', () => {
    expect(createPageUrl('orders')).toBe('/orders');
  });

  it('handles multi-word page names', () => {
    expect(createPageUrl('Admin Email Settings')).toBe('/admin-email-settings');
  });
});
