import { describe, expect, test } from 'vitest';

import { formatCrmTaskDateTimeInput, parseCrmTaskLocalDateTime } from '../../lib/crm-task-datetime';

describe('CRM task date-time timezone helpers', () => {
  test('converts São Paulo local input to UTC independently of the device timezone', () => {
    expect(parseCrmTaskLocalDateTime('2026-10-21T23:45')?.toISOString()).toBe('2026-10-22T02:45:00.000Z');
  });

  test('formats UTC instants back to the same São Paulo local input value', () => {
    expect(formatCrmTaskDateTimeInput('2026-10-22T02:45:00.000Z')).toBe('2026-10-21T23:45');
  });

  test.each(['', '2026-02-30T12:00', '2026-10-21T25:00', 'yesterday'])('rejects invalid local value %j', (value) => {
    expect(parseCrmTaskLocalDateTime(value)).toBeNull();
  });
});
