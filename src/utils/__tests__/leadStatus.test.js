import { describe, it, expect } from 'vitest';
import { CONVERSION_STATUSES, isConvertedLead, isOpenLead, conversionRate } from '../leadStatus';

describe('conversionRate - the dashboard Conversion Rate KPI', () => {
  // The bug this exists to prevent: the convert step moves a lead to
  // 'First Order' (or 'Active'), but the KPI counted only 'Converted', so every
  // lead converted through the app read as 0%.
  it('counts a lead the convert step moved to First Order', () => {
    const leads = [
      { id: 'L1', status: 'First Order' },
      { id: 'L2', status: 'Negotiation' },
    ];
    expect(conversionRate(leads)).toBe(50);
  });

  it('counts every conversion status, and nothing else', () => {
    const leads = [
      { status: 'Converted' },
      { status: 'First Order' },
      { status: 'Active' },
      { status: 'Lost' },
      { status: 'Lead Created' },
      { status: 'Call' },
      { status: 'Meeting' },
      { status: 'Sample Sent' },
    ];
    expect(conversionRate(leads)).toBe(37.5);
  });

  it('is 0 with no leads rather than NaN', () => {
    expect(conversionRate([])).toBe(0);
    expect(conversionRate(undefined)).toBe(0);
  });

  it('agrees with the statuses the convert step can write', () => {
    // convertLeadToOrder defaults to 'First Order'; Leads.jsx offers the rest.
    expect(CONVERSION_STATUSES).toEqual(expect.arrayContaining(['Converted', 'First Order', 'Active']));
  });
});

describe('isOpenLead - what the pipeline value and follow-up reminders count', () => {
  it('treats converted and lost leads as closed', () => {
    for (const status of CONVERSION_STATUSES) expect(isOpenLead({ status })).toBe(false);
    expect(isOpenLead({ status: 'Lost' })).toBe(false);
  });

  it('treats a lead still being worked as open', () => {
    expect(isOpenLead({ status: 'Negotiation' })).toBe(true);
    expect(isConvertedLead({ status: 'Negotiation' })).toBe(false);
  });
});
