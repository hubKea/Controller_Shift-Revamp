/**
 * @jest-environment node
 */

import { formatRelativeTime } from '../web/js/notifications-utils.js';

describe('formatRelativeTime', () => {
  const now = new Date('2025-10-20T12:00:00Z');

  it('returns "just now" for sub-minute differences', () => {
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(thirtySecondsAgo, { now })).toBe('just now');
  });

  it('returns minutes for recent differences', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo, { now })).toBe('5m ago');
  });

  it('returns hours for differences under a day', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo, { now })).toBe('3h ago');
  });

  it('returns weeks for larger differences', () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(tenDaysAgo, { now })).toBe('1w ago');
  });

  it('handles invalid input gracefully', () => {
    expect(formatRelativeTime(null, { now })).toBe('just now');
    expect(formatRelativeTime(undefined, { now })).toBe('just now');
  });
});
