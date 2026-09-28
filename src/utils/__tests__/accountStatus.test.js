import { describe, it, expect } from 'vitest';
import { isBlockedStatus, blockedLoginResult, signedOutMessage } from '../accountStatus';

describe('account status', () => {
  it('blocks the three statuses the database blocks (043)', () => {
    expect(['Pending', 'Rejected', 'Inactive'].every(isBlockedStatus)).toBe(true);
  });

  it('lets Active through, and an unexpected status too (a blocklist, like the database)', () => {
    expect(isBlockedStatus('Active')).toBe(false);
    expect(isBlockedStatus(undefined)).toBe(false);
    expect(isBlockedStatus('Something else')).toBe(false);
  });

  it('tells sign-in which refusal it was', () => {
    expect(blockedLoginResult('Inactive')).toBe('inactive');
    expect(blockedLoginResult('Pending')).toBe('pending');
    expect(blockedLoginResult('Active')).toBeNull();
  });

  it('explains a deactivation to the person signed out', () => {
    expect(signedOutMessage('Inactive')).toMatch(/deactivated/);
    expect(signedOutMessage('Active')).toBeNull();
  });
});
