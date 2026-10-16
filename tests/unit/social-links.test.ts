import { expect, test } from 'vitest';

import { normalizeInstagramProfileUrl } from '../../lib/social-links';

test.each([
  ['@cafe.real', 'https://www.instagram.com/cafe.real/'],
  ['cafe.real', 'https://www.instagram.com/cafe.real/'],
  ['www.instagram.com/cafe.real/?igsh=abc', 'https://www.instagram.com/cafe.real/'],
  ['http://instagram.com/cafe.real', 'https://www.instagram.com/cafe.real/'],
])('normalizes Instagram profile %s', (value, expected) => {
  expect(normalizeInstagramProfileUrl(value)).toBe(expected);
});

test.each([
  'https://www.instagram.com/p/abc/',
  'https://www.instagram.com/reel/abc/',
  'https://www.instagram.com/stories/cafe.real/',
  'https://www.instagram.com/cafe.real/extra/',
  'https://instagram.com.attacker.example/cafe.real/',
  'javascript:alert(1)',
  '',
  null,
  undefined,
])('rejects non-profile Instagram value %s', (value) => {
  expect(normalizeInstagramProfileUrl(value)).toBeNull();
});
