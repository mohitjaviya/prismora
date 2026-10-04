import { describe, it, expect } from 'vitest';
import { valueText, shortRupees, valueFontSize, kpiDisplay } from '../kpiValue';

const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

describe('valueText', () => {
  it('keeps strings as given and Indian commas on numbers', () => {
    expect(valueText('₹2,29,456')).toBe('₹2,29,456');
    expect(valueText(2294567)).toBe('22,94,567');
    expect(valueText(0)).toBe('0');
    expect(valueText(null)).toBe('');
    expect(valueText(undefined)).toBe('');
  });
});

describe('shortRupees', () => {
  it('has no short form below a crore', () => {
    expect(shortRupees(inr(999))).toBeNull();
    expect(shortRupees(inr(229456))).toBeNull();
    expect(shortRupees(inr(9999999))).toBeNull();
  });
  it('gives crores with two decimals from a crore up', () => {
    expect(shortRupees(inr(22945678))).toBe('₹2.29 Cr');
    expect(shortRupees(inr(10000000))).toBe('₹1.00 Cr');
    expect(shortRupees(inr(1250000000))).toBe('₹125.00 Cr');
  });
  it('keeps the sign of a negative amount', () => {
    expect(shortRupees(inr(-22945678))).toBe('-₹2.29 Cr');
    expect(shortRupees('−₹2,29,45,678')).toBe('−₹2.29 Cr');
  });
  it('leaves anything that is not a rupee amount alone', () => {
    expect(shortRupees('22945678')).toBeNull();
    expect(shortRupees('12 of 21')).toBeNull();
    expect(shortRupees('₹2.29L')).toBeNull();
    expect(shortRupees('')).toBeNull();
  });
});

describe('valueFontSize', () => {
  it('scales with the container between 15px and 24px', () => {
    expect(valueFontSize('₹999')).toBe('min(1.5rem, max(0.9375rem, calc(100cqi / 2.48)))');
    expect(valueFontSize('₹2,29,45,678')).toBe('min(1.5rem, max(0.9375rem, calc(100cqi / 7.44)))');
  });
  it('may go smaller once the full figure is asked for', () => {
    expect(valueFontSize('₹1,25,00,00,000', { expanded: true })).toMatch(/^min\(1\.5rem, max\(0\.6875rem,/);
  });
});

describe('kpiDisplay', () => {
  it('never swaps a value under a crore', () => {
    for (const n of [999, 229456]) {
      const d = kpiDisplay(inr(n));
      expect(d.full).toBe(inr(n));
      expect(d.short).toBeNull();
      expect(d.fullClass).toBe('');
    }
  });
  it('swaps a crore value only below its own container width', () => {
    const d = kpiDisplay(inr(22945678)); // ₹2,29,45,678 — 12 characters
    expect(d).toEqual({ full: '₹2,29,45,678', short: '₹2.29 Cr', fullClass: '@max-[7rem]:hidden', shortClass: 'hidden @max-[7rem]:inline' });
    const big = kpiDisplay(inr(1250000000)); // ₹1,25,00,00,000 — 15 characters
    expect(big.short).toBe('₹125.00 Cr');
    expect(big.fullClass).toBe('@max-[8.75rem]:hidden');
  });
  it('always shows the short form of a figure too long for the table', () => {
    const d = kpiDisplay(inr(1e15));
    expect(d.fullClass).toBe('hidden');
    expect(d.shortClass).toBe('inline');
  });
});
