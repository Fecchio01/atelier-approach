import { expect, test } from 'vitest';

import { normalizePublishedPhone, toWhatsAppHref } from '../../lib/contact-links';

test.each([
  ['0800 123 4567', '08001234567'],
  ['0300-123-4567', '03001234567'],
  ['0303 123 4567', '03031234567'],
  ['0500 654 4005', '05006544005']
])('keeps a published Brazilian service phone dialable without inferring WhatsApp: %s', (value, expected) => {
  expect(normalizePublishedPhone(value)).toBe(expected);
  expect(toWhatsAppHref(value)).toBeNull();
});

test.each(['0800 123 456', '0800 123 45678', '0400 123 4567', '0800 123 4567 / 0800 765 4321'])('rejects malformed or unsupported service phone %s', (value) => {
  expect(normalizePublishedPhone(value)).toBeNull();
});

test.each([
  ['+55 (11) 3333-0000', '+551133330000'],
  ['(21) 97942-9064', '+5521979429064'],
  ['+1 415 555 0100', '+14155550100'],
  ['+55 10 99999-8888', null],
  ['+55 11 99999-9999', null],
  ['+55 11 3333-0000 / +55 11 99999-8888', null],
  ['+55 11 3333-0000; +55 11 99999-8888', null],
  ['https://wa.me/5511999998888', null],
  ['não informado', null], ['00000000000', null], ['11 9999-8888', null],
  ['99999-8888', null], ['3333-0000', null], ['11999998888123', null]
])('normalizes a single published phone without joining targets: %s', (value, expected) => {
  expect(normalizePublishedPhone(value)).toBe(expected);
});

test.each([
  ['+55 (21) 97942-9064', 'https://wa.me/5521979429064'],
  ['(21) 2603-8294', 'https://wa.me/552126038294'],
  ['11 99999-8888', 'https://wa.me/5511999998888'],
  ['https://wa.me/5511999998888', 'https://wa.me/5511999998888'],
  ['http://wa.me/5511999998888?text=Ol%C3%A1', 'https://wa.me/5511999998888?text=Ol%C3%A1'],
  ['api.whatsapp.com/send?phone=5511999998888&text=pedido-123', 'https://wa.me/5511999998888?text=pedido-123'],
  ['https://wa.me/14155550100', 'https://wa.me/14155550100']
])('normalizes only the declared WhatsApp target %s', (value, expected) => {
  expect(toWhatsAppHref(value)).toBe(expected);
});

test.each([
  null, undefined, '',
  '+55 10 99999-8888', '+55 23 99999-8888', '+55 11 9999-8888', '+55 11 19999-8888',
  '+55 11 33333-4444', '+55 11 99999-88880', 'Ligue 11 99999-8888',
  'https://wa.me/', 'https://wa.me/not-a-number', 'https://wa.me/5510999998888',
  'https://wa.me/message/EXPIRED123', 'http://wa.link/dead123?text=5511999999999',
  'https://api.whatsapp.com/garbage', 'https://api.whatsapp.com/send?phone=abc',
  'https://api.whatsapp.com/send/5511999000111?phone=5511888777666&text=pedido-123',
  'https://api.whatsapp.com/send?phone=5511999998888&phone=5521999998888',
  'https://wa.me/5511999998888?phone=5521999998888',
  'https://wa.me.evil.example/5511999998888', 'https://user@wa.me/5511999998888',
  'https://wa.me:444/5511999998888', 'javascript:5511999998888'
])('rejects an invalid or unresolved WhatsApp target %s', (value) => {
  expect(toWhatsAppHref(value)).toBeNull();
});
