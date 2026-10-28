import { describe, expect, test } from 'vitest';

import { analyzeLead, hashApproval } from '../../lib/agents/model';
import { canAnalyzeLead, automationPolicy } from '../../lib/agents/policy';

describe('assisted lead analysis', () => {
  test('uses only stored CRM facts and clearly labels unknown external data', () => {
    const result = analyzeLead({
      id: 'lead-1', version: 1, name: 'Café Exemplo', stage: 'CONTACTED', phone: null, whatsapp: null,
      website: 'https://example.com', instagram: null, address: null, category: 'cafeteria'
    }, new Date('2026-10-27T12:00:00.000Z'));

    expect(result.knownFacts).toContain('Há um site salvo no cadastro.');
    expect(result.unknowns).toContain('Telefone/WhatsApp não consta no cadastro.');
    expect(result.unknowns).toContain('Nenhum dado foi verificado fora do CRM nesta análise.');
    expect(result.recommendation.taskType).toBe('OTHER');
    expect(result.dataCoverage).toBe(40);
    expect(result.recommendation.dueDate).toBe('2026-10-28T12:00:00.000Z');
    expect(result.summary).not.toMatch(/vendas|faturamento|garantido/i);
  });

  test('does not mislabel a listed phone as a verified WhatsApp number', () => {
    const result = analyzeLead({
      id: 'lead-2', version: 1, name: 'Loja Exemplo', stage: 'CONTACTED', phone: '+5511999999999', whatsapp: null,
      website: null, instagram: null, address: null, category: null
    });
    expect(result.recommendation.title).toContain('por telefone');
    expect(result.recommendation.taskType).toBe('PHONE');
    expect(result.knownFacts).not.toContain('Há um número identificado como WhatsApp salvo no cadastro.');
  });

  test('hash changes when a reviewable recommendation changes', () => {
    expect(hashApproval({ title: 'Revisar contato' })).toBe(hashApproval({ title: 'Revisar contato' }));
    expect(hashApproval({ title: 'Revisar contato' })).not.toBe(hashApproval({ title: 'Enviar mensagem' }));
  });

  test('only analyzes open, named leads and keeps the external model disabled with zero spend', () => {
    expect(canAnalyzeLead({ id: '1', name: 'Aberta', stage: 'CONTACTED' })).toBe(true);
    expect(canAnalyzeLead({ id: '2', name: 'Ganha', stage: 'WON' })).toBe(false);
    expect(canAnalyzeLead({ id: '3', name: null, stage: 'CONTACTED' })).toBe(false);
    expect(automationPolicy.externalModelEnabled).toBe(false);
    expect(automationPolicy.maximumExternalCostPerRunUsd).toBe(0);
  });
});
