/**
 * GST on an invoice: which kind, and how it splits (D-17).
 *
 * The database decides this when an invoice is issued (invoice_gst_split,
 * migration 053) and stores it on the invoice; the screen and the printed
 * invoice read what was stored. These helpers mirror that rule for the
 * preview shown before an invoice exists, and for any invoice that predates
 * the stored fields.
 */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh',
];

const norm = (s) => String(s || '').trim().toLowerCase();

/** 'intra' (CGST + SGST) when supply is within the seller's state, else 'inter' (IGST). */
export const supplyTypeFor = (placeOfSupply, sellerState) =>
  (norm(placeOfSupply) && norm(placeOfSupply) === norm(sellerState) ? 'intra' : 'inter');

/**
 * Split a tax amount, rounded once: CGST is half to the paisa, SGST the rest,
 * so CGST + SGST always equals the tax — the same total as IGST.
 */
export const splitTax = (tax, supplyType) => {
  const t = Number(tax) || 0;
  if (supplyType === 'inter') return { cgst: 0, sgst: 0, igst: t };
  const cgst = Math.round((t / 2) * 100) / 100;
  return { cgst, sgst: Math.round((t - cgst) * 100) / 100, igst: 0 };
};

/** What an invoice was issued with — stored fields first. */
export const invoiceGst = (invoice, fallbackSeller = {}) => {
  const sellerState = invoice?.sellerState || fallbackSeller.state || '';
  const placeOfSupply = invoice?.placeOfSupply || sellerState;
  const supplyType = invoice?.supplyType || supplyTypeFor(placeOfSupply, sellerState);
  const stored = invoice && invoice.cgst != null && invoice.sgst != null && invoice.igst != null;
  const amounts = stored
    ? { cgst: Number(invoice.cgst), sgst: Number(invoice.sgst), igst: Number(invoice.igst) }
    : splitTax(invoice?.tax, supplyType);
  return {
    seller: {
      name: invoice?.sellerName || fallbackSeller.companyName || '',
      gstin: invoice?.sellerGstin || fallbackSeller.gstin || '',
      state: sellerState,
    },
    placeOfSupply,
    supplyType,
    ...amounts,
  };
};
