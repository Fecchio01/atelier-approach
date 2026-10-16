import { expect, test } from 'vitest';

import { normalizeInstagramProfileUrl } from '../../lib/social-links';

test.each([
  ['@cafe.real', 'https://www.instagram.com/cafe.real/'],
  ['cafe.real', 'https://www.instagram.com/cafe.real/'],
  ['www.instagram.com/cafe.real/?igsh=abc', 'https://www.instagram.com/cafe.real/'],
  ['http://instagram.com/cafe.real', 'https://www.instagram.com/cafe.real/'],
  ['@_cafe_', 'https://www.instagram.com/_cafe_/'],
])('normalizes Instagram profile %s', (value, expected) => {
  expect(normalizeInstagramProfileUrl(value)).toBe(expected);
});

test.each([
  'https://www.instagram.com/p/abc/',
  'https://www.instagram.com/reel/abc/',
  'https://www.instagram.com/stories/cafe.real/',
  'https://www.instagram.com/cafe.real/extra/',
  'https://www.instagram.com/../cafe.real/',
  'https://instagram.com.attacker.example/cafe.real/',
  'javascript:alert(1)',
  '.',
  '..',
  '@...',
  '.cafe',
  'cafe.',
  'cafe..real',
  'https://www.instagram.com/.cafe/',
  'https://www.instagram.com/cafe./',
  'https://www.instagram.com/cafe..real/',
  '',
  null,
  undefined,
])('rejects non-profile Instagram value %s', (value) => {
  expect(normalizeInstagramProfileUrl(value)).toBeNull();
});
