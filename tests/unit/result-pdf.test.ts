import { describe, expect, test } from 'vitest';

import { parseResultDocumentText } from '../../lib/result-pdf';

describe('PDF realized-result parser', () => {
  test('maps explicit fixed-metric aliases and Brazilian currency/number formats', () => {
    expect(parseResultDocumentText([
      'Período: 01/10/2026 a 07/10/2026',
      'Abordagens realizadas: 1.250',
      'Qualificados: 32',
      'Reuniões realizadas: 8',
      'Vendas fechadas: 2',
      'Receita: R$ 12.345,67',
      'MRR: R$ 1.250,50',
      'Follow-ups concluídos: 24',
      'Taxa de conversão: 12,5%'
    ].join('\n'))).toEqual({
      period: { start: '2026-10-01', end: '2026-10-07' },
      rows: [
        { label: 'Abordagens realizadas', metricKey: 'approaches', value: 1250, unit: null },
        { label: 'Qualificados', metricKey: 'interests', value: 32, unit: null },
        { label: 'Reuniões realizadas', metricKey: 'meetings', value: 8, unit: null },
        { label: 'Vendas fechadas', metricKey: 'sales', value: 2, unit: null },
        { label: 'Receita', metricKey: 'revenue', value: 12345.67, unit: 'R$' },
        { label: 'MRR', metricKey: 'mrr', value: 1250.5, unit: 'R$' },
        { label: 'Follow-ups concluídos', metricKey: 'followUpsCompleted', value: 24, unit: null },
        { label: 'Taxa de conversão', metricKey: 'conversionRate', value: 12.5, unit: '%' }
      ]
    });
  });

  test('does not guess incomplete periods and leaves unknown labels editable', () => {
    expect(parseResultDocumentText('Período: outubro de 2026\nConversas humanas: 7')).toEqual({
      period: null,
      rows: [{ label: 'Conversas humanas', metricKey: null, value: 7, unit: null }]
    });
  });

  test('leaves ambiguous values and lines without explicit totals unresolved', () => {
    expect(parseResultDocumentText('Abordagens: 8 / 20\nReuniões\nReceita: R$ 5,00 ou R$ 8,00')).toEqual({
      period: null,
      rows: [
        { label: 'Abordagens', metricKey: 'approaches', value: null, unit: null },
        { label: 'Reuniões', metricKey: 'meetings', value: null, unit: null },
        { label: 'Receita', metricKey: 'revenue', value: null, unit: 'R$' }
      ]
    });
  });

  test('does not infer a fixed metric from a similar custom label', () => {
    expect(parseResultDocumentText('Custo por venda: R$ 75,00').rows).toEqual([
      { label: 'Custo por venda', metricKey: null, value: 75, unit: 'R$' }
    ]);
  });
});
