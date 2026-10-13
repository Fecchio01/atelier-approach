import { describe, expect, test } from 'vitest';

import { getSettingsInitialTab } from '../../lib/settings-tabs';

describe('settings initial tab', () => {
  test('opens account by default instead of restoring another section', () => {
    expect(getSettingsInitialTab()).toBe('account');
  });

  test('opens security when returning from a password validation error', () => {
    expect(getSettingsInitialTab('current')).toBe('security');
  });

  test('ignores unknown password query values and still opens account', () => {
    expect(getSettingsInitialTab('unknown')).toBe('account');
  });
});
