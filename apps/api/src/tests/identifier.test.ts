import { describe, expect, it } from 'vitest';
import { qualifiedName, regclassName } from '../db/identifier.js';

describe('identifier helpers', () => {
  it('quotes safe qualified names', () => {
    expect(qualifiedName('sellerkg', 'data_sources')).toBe('"sellerkg"."data_sources"');
    expect(regclassName('wb_prod', 'wb_orders')).toBe('wb_prod.wb_orders');
  });

  it('rejects unsafe identifiers', () => {
    expect(() => qualifiedName('sellerkg;drop schema public', 'data_sources')).toThrow();
    expect(() => qualifiedName('sellerkg', 'DataSources')).toThrow();
  });
});
