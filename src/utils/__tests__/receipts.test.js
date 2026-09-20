import { describe, it, expect } from 'vitest';
import {
  receiptSourceOf, canRecordReceipt, describeReceipt, validateReceipt, RECEIPT_EVIDENCE,
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
