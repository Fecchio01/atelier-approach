import { describe, expect, test } from 'vitest';
import { formatMeetingDateTimeLocal, parseMeetingAt } from '../../lib/meeting-scheduling';

describe('meeting scheduling', () => {
  test('parses an optional meeting timestamp and allows clearing it', () => {
    expect(parseMeetingAt(undefined)).toBeUndefined();
    expect(parseMeetingAt(null)).toBeNull();
    expect(parseMeetingAt('2026-10-15T09:00:00-03:00')).toEqual(new Date('2026-10-15T12:00:00.000Z'));
  });

  test('rejects malformed meeting timestamps rather than silently storing an invalid date', () => {
    expect(() => parseMeetingAt('not-a-date')).toThrow('Data e hora da reunião inválidas.');
    expect(() => parseMeetingAt(123)).toThrow('Data e hora da reunião inválidas.');
  });

  test('formats saved UTC timestamps for the São Paulo datetime input', () => {
    expect(formatMeetingDateTimeLocal(new Date('2026-10-15T12:00:00.000Z'))).toBe('2026-10-15T09:00');
    expect(formatMeetingDateTimeLocal(null)).toBe('');
  });
});
