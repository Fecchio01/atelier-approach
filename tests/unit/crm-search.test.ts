import { expect, test } from 'vitest';

import { searchCrmLeads } from '../../lib/crm-search';

const leads = [
  {
    id: 'lead-cafe',
    name: 'Café do João',
    phone: '+55 (11) 99999-8888',
    whatsapp: null,
    website: 'https://cafedojoao.example',
    instagram: '@cafedojoao',
    address: 'Rua São Bento, 10',
    category: 'coffee_shop'
  },
  {
    id: 'lead-clinic',
    name: 'Clínica Central',
    phone: null,
    whatsapp: 'https://wa.me/5511987654321',
    website: null,
    instagram: null,
    address: 'Campinas, SP',
    category: 'clinic'
  }
];

test('returns the full board when the CRM search is empty', () => {
  expect(searchCrmLeads(leads, ' ')).toEqual(leads);
});

test('searches company names without accent sensitivity', () => {
  expect(searchCrmLeads(leads, 'cafe')).toEqual([leads[0]]);
});

test('searches phone numbers independent of punctuation', () => {
  expect(searchCrmLeads(leads, '5511999998888')).toEqual([leads[0]]);
});

test('searches WhatsApp links, sites, Instagram, address and category', () => {
  expect(searchCrmLeads(leads, '987654321')).toEqual([leads[1]]);
  expect(searchCrmLeads(leads, 'cafedojoao')).toEqual([leads[0]]);
  expect(searchCrmLeads(leads, 'sao bento')).toEqual([leads[0]]);
  expect(searchCrmLeads(leads, 'clinic')).toEqual([leads[1]]);
});

test('requires every query term to match and never mutates the board', () => {
  expect(searchCrmLeads(leads, 'cafe campinas')).toEqual([]);
  expect(searchCrmLeads(leads, 'cafe joao')).toEqual([leads[0]]);
  expect(leads).toHaveLength(2);
});
