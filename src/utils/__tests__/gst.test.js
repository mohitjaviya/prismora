import { describe, it, expect } from 'vitest';
import { supplyTypeFor, splitTax, invoiceGst } from '../gst';

describe('GST type and split', () => {
  it('same state as the seller is CGST + SGST; another state is IGST', () => {
    expect(supplyTypeFor('Gujarat', 'Gujarat')).toBe('intra');
    expect(supplyTypeFor(' gujarat ', 'Gujarat')).toBe('intra');
    expect(supplyTypeFor('Maharashtra', 'Gujarat')).toBe('inter');
  });

  // The old print rounded each half on its own: ₹1,681 of tax printed as
  // ₹841 + ₹841 = ₹1,682.
  it('rounds once, so both ways total the same', () => {
    const intra = splitTax(1681, 'intra');
    const inter = splitTax(1681, 'inter');
    expect(intra.cgst + intra.sgst).toBe(1681);
    expect(inter.igst).toBe(1681);
    expect(intra).toEqual({ cgst: 840.5, sgst: 840.5, igst: 0 });
    expect(splitTax(0.03, 'intra').cgst + splitTax(0.03, 'intra').sgst).toBeCloseTo(0.03, 10);
  });

  it('reads an invoice as it was issued, not as Settings are now', () => {
    const issued = { sellerName: 'Old Name', sellerGstin: '24OLD', sellerState: 'Gujarat', placeOfSupply: 'Maharashtra', supplyType: 'inter', tax: 180, cgst: 0, sgst: 0, igst: 180 };
    const g = invoiceGst(issued, { companyName: 'New Name', gstin: '27NEW', state: 'Maharashtra' });
    expect(g.seller).toEqual({ name: 'Old Name', gstin: '24OLD', state: 'Gujarat' });
    expect(g.supplyType).toBe('inter');
    expect(g.igst).toBe(180);
  });
});
