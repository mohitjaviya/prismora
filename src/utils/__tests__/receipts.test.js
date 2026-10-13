import { describe, it, expect } from 'vitest';
import {
  receiptSourceOf, canRecordReceipt, describeReceipt, validateReceipt, RECEIPT_EVIDENCE,
  mayRecordReceiptFor, mayWithdrawReceipt, partnerReceiptLabel,
} from '../receipts';

describe('receiptSourceOf', () => {
  it('is null until somebody says the goods arrived', () => {
    expect(receiptSourceOf({ status: 'Delivered' })).toBeNull();
    expect(receiptSourceOf({ receivedByDistributor: false })).toBeNull();
    expect(receiptSourceOf(null)).toBeNull();
  });

  it('separates the customer saying so from staff saying so', () => {
    expect(receiptSourceOf({ receivedByDistributor: true, receiptSource: 'partner' })).toBe('partner');
    expect(receiptSourceOf({ receivedByDistributor: true, receiptSource: 'staff' })).toBe('staff');
  });

  it('reads an order confirmed before this existed as the customer, because that was the only way', () => {
    expect(receiptSourceOf({ receivedByDistributor: true })).toBe('partner');
    expect(receiptSourceOf({ receivedByDistributor: true, receiptSource: undefined })).toBe('partner');
  });
});

describe('canRecordReceipt', () => {
  it('allows it once the goods have left the warehouse', () => {
    expect(canRecordReceipt({ status: 'Shipped' })).toBe(true);
    expect(canRecordReceipt({ status: 'Delivered' })).toBe(true);
  });

  it('refuses before dispatch, so nobody confirms goods that have not moved', () => {
    ['Pending', 'Processing', 'Cancelled', 'Draft'].forEach(status => {
      expect(canRecordReceipt({ status })).toBe(false);
    });
  });

  it('refuses once it is already recorded, so it cannot be overwritten', () => {
    expect(canRecordReceipt({ status: 'Delivered', receivedByDistributor: true })).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(canRecordReceipt(null)).toBe(false);
    expect(canRecordReceipt(undefined)).toBe(false);
  });
});

describe('describeReceipt', () => {
  it('says nothing when nothing was recorded', () => {
    expect(describeReceipt({ status: 'Delivered' })).toBeNull();
  });

  it('names the customer without inventing a source', () => {
    expect(describeReceipt({ receivedByDistributor: true, receiptSource: 'partner' }))
      .toBe('Confirmed by the customer');
  });

  it('names the employee and the evidence', () => {
    expect(describeReceipt({
      receivedByDistributor: true, receiptSource: 'staff',
      receiptRecordedBy: 'Admin User', receiptEvidence: 'Phone call',
    })).toBe('Recorded by Admin User — phone call');
  });

  it('still says it was staff when the name or evidence went missing', () => {
    expect(describeReceipt({ receivedByDistributor: true, receiptSource: 'staff' }))
      .toBe('Recorded by staff');
    expect(describeReceipt({ receivedByDistributor: true, receiptSource: 'staff', receiptRecordedBy: '  ' }))
      .toBe('Recorded by staff');
  });
});

describe('validateReceipt', () => {
  it('accepts each listed kind of evidence', () => {
    RECEIPT_EVIDENCE.filter(e => e !== 'Other').forEach(evidence => {
      expect(validateReceipt({ evidence })).toEqual({ ok: true });
    });
  });

  it('refuses a tick with nothing behind it', () => {
    expect(validateReceipt({}).ok).toBe(false);
    expect(validateReceipt({ evidence: '' }).ok).toBe(false);
    expect(validateReceipt({ evidence: '   ' }).ok).toBe(false);
  });

  it('refuses evidence it does not recognise', () => {
    expect(validateReceipt({ evidence: 'Trust me' }).ok).toBe(false);
  });

  it('makes "Other" say what it was', () => {
    expect(validateReceipt({ evidence: 'Other' }).ok).toBe(false);
    expect(validateReceipt({ evidence: 'Other', note: '' }).ok).toBe(false);
    expect(validateReceipt({ evidence: 'Other', note: 'Courier SMS' })).toEqual({ ok: true });
  });

  it('explains the refusal rather than just failing', () => {
    expect(validateReceipt({}).error).toMatch(/how you know/i);
    expect(validateReceipt({ evidence: 'Other' }).error).toMatch(/describe/i);
  });
});

// Gap 19 (096): mirrors can_record_order_receipt / withdraw_order_receipt.
describe('mayRecordReceiptFor', () => {
  const order = { id: 'O9', assignedTo: 'SE1', createdBy: 'SE1' };
  const v = (o) => ({ id: 'X', role: 'Sales Executive', level: 'sales', salesFull: true, managedUsers: [], ...o });
  it('lets the order desk roles record any order', () => {
    for (const role of ['Admin', 'Super Admin', 'Accounts', 'Warehouse Manager', 'Dispatch Team']) {
      expect(mayRecordReceiptFor(order, v({ role, level: 'staff', salesFull: false }))).toBe(true);
    }
  });
  it('lets the salesperson record their own order only', () => {
    expect(mayRecordReceiptFor(order, v({ id: 'SE1' }))).toBe(true);
    expect(mayRecordReceiptFor(order, v({ id: 'SE2' }))).toBe(false);
    expect(mayRecordReceiptFor({ ...order, assignedTo: 'SE2' }, v({ id: 'SE1' }))).toBe(true); // created it
  });
  it("lets the salesperson's manager record it, not other managers", () => {
    const mgr = v({ id: 'SM', role: 'Sales Manager', level: 'manager', managedUsers: ['SE1'] });
    expect(mayRecordReceiptFor(order, mgr)).toBe(true);
    expect(mayRecordReceiptFor(order, { ...mgr, managedUsers: ['SE2'] })).toBe(false);
    expect(mayRecordReceiptFor({ id: 'O79' }, mgr)).toBe(false); // no salesperson
  });
  it('refuses Director, Customer Support, Purchase Manager and partners', () => {
    expect(mayRecordReceiptFor(order, v({ role: 'Director', level: 'admin', salesFull: false }))).toBe(false);
    expect(mayRecordReceiptFor(order, v({ role: 'Customer Support', level: 'staff', salesFull: false }))).toBe(false);
    expect(mayRecordReceiptFor(order, v({ id: 'SE1', role: 'Purchase Manager', level: 'manager', salesFull: false }))).toBe(false);
    expect(mayRecordReceiptFor(order, v({ id: 'SE1', role: 'Retailer', level: 'partner' }))).toBe(false);
  });
});

describe('mayWithdrawReceipt', () => {
  const staff = { receivedByDistributor: true, receiptSource: 'staff', receiptRecordedById: 'SE1' };
  it('lets the recorder and Admin / Super Admin withdraw', () => {
    expect(mayWithdrawReceipt(staff, { id: 'SE1', role: 'Sales Executive', level: 'sales' })).toBe(true);
    expect(mayWithdrawReceipt(staff, { id: 'A', role: 'Admin', level: 'admin' })).toBe(true);
    expect(mayWithdrawReceipt(staff, { id: 'S', role: 'Super Admin', level: 'admin' })).toBe(true);
  });
  it('refuses everyone else, old receipts without a recorder id, and partner confirmations', () => {
    expect(mayWithdrawReceipt(staff, { id: 'SM', role: 'Sales Manager', level: 'manager' })).toBe(false);
    expect(mayWithdrawReceipt(staff, { id: 'AC', role: 'Accounts', level: 'staff' })).toBe(false);
    expect(mayWithdrawReceipt({ ...staff, receiptRecordedById: null }, { id: 'SE1', role: 'Sales Executive', level: 'sales' })).toBe(false);
    expect(mayWithdrawReceipt({ receivedByDistributor: true, receiptSource: 'partner' }, { id: 'A', role: 'Admin', level: 'admin' })).toBe(false);
  });
});

describe('partnerReceiptLabel', () => {
  it('tells the partner a receipt was recorded, without who or how', () => {
    expect(partnerReceiptLabel({ receivedByDistributor: true, receiptSource: 'staff', receiptRecordedBy: 'Asha' })).toBe('Receipt recorded by our team');
    expect(partnerReceiptLabel({ receivedByDistributor: true, receiptSource: 'partner' })).toBe('Receipt confirmed');
    expect(partnerReceiptLabel({ receivedByDistributor: false })).toBeNull();
  });
});
