/**
 * Unit tests for utility functions
 * These tests run without Firebase emulator and validate helper functions
 */

const { nowIso } = require('../js/utils.cjs');

describe('utils.js - nowIso function', () => {
  test('nowIso returns a valid ISO 8601 string', () => {
    const result = nowIso();

    // Should be a string
    expect(typeof result).toBe('string');

    // Should match ISO 8601 format (basic check)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Should be parseable as a valid date
    const date = new Date(result);
    expect(date.toISOString()).toBe(result);
  });

  test('nowIso returns current time', () => {
    const before = Date.now();
    const isoString = nowIso();
    const after = Date.now();

    const timestamp = new Date(isoString).getTime();

    // The returned time should be between before and after
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test('nowIso is defined and not undefined', () => {
    // This test explicitly checks for the nowIso regression
    expect(nowIso).toBeDefined();
    expect(typeof nowIso).toBe('function');

    // Should not throw when called
    expect(() => nowIso()).not.toThrow();
  });

  test('successive calls to nowIso produce chronologically ordered timestamps', () => {
    const timestamps = [];

    for (let i = 0; i < 5; i++) {
      timestamps.push(nowIso());
    }

    // Convert to milliseconds for comparison
    const millis = timestamps.map((ts) => new Date(ts).getTime());

    // Each timestamp should be >= the previous one
    for (let i = 1; i < millis.length; i++) {
      expect(millis[i]).toBeGreaterThanOrEqual(millis[i - 1]);
    }
  });

  test('nowIso output can be used in JSON', () => {
    const isoString = nowIso();

    const obj = {
      createdAt: isoString,
      updatedAt: isoString,
    };

    // Should serialize and deserialize cleanly
    const json = JSON.stringify(obj);
    expect(json).toContain(isoString);

    const parsed = JSON.parse(json);
    expect(parsed.createdAt).toBe(isoString);
  });
});

// Note: data-model.js tests are covered in the emulator tests
// See tests/report-timestamps.test.js for full integration testing
