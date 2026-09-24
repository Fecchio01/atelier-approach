import { expect, test } from 'vitest';

import { possibleWhatsAppHref } from '../../lib/contact-links';

test('offers a tentative WhatsApp link only for a Brazilian mobile number', () => {
  expect(possibleWhatsAppHref('+55 (21) 97942-9064')).toBe('https://wa.me/5521979429064');
  expect(possibleWhatsAppHref('(21) 2603-8294')).toBeNull();
  expect(possibleWhatsAppHref('+1 415 555 0100')).toBeNull();
});
