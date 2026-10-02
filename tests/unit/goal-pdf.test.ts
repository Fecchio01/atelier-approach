import { describe, expect, test } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { parseGoalDocumentText } from '../../lib/goal-pdf';
import { MAX_GOAL_PDF_BYTES, readGoalPdfText } from '../../lib/read-goal-pdf';

describe('PDF goal text suggestions', () => {
  test('maps known goal names to CRM metrics and parses Brazilian money and percentages', () => {
    expect(parseGoalDocumentText([
      'Abordagens: 500',
      'Interesses: 120',
      'Reuniões e retornos: 12',
      'Vendas fechadas: 3',
      'Receita de vendas: R$ 25.000,00',
      'MRR: R$ 1.500,50',
      'Follow-ups concluídos: 8',
      'Taxa de conversão: 15%'
    ].join('\n'))).toEqual({
      targets: {
        approaches: 500,
        interests: 120,
        meetings: 12,
        sales: 3,
        revenue: 25000,
        mrr: 1500.5,
        followUpsCompleted: 8,
        conversionRate: 15
      },
      customGoals: []
    });
  });

  test('extracts custom goals with units and an explicitly labeled current value', () => {
    expect(parseGoalDocumentText('Carros: atual 1, meta 3 carros\nClientes atendidos: 20 clientes')).toEqual({
      targets: {},
      customGoals: [
        { name: 'Carros', unit: 'carros', target: 3, current: 1 },
        { name: 'Clientes atendidos', unit: 'clientes', target: 20, current: 0 }
      ]
    });
  });

  test('does not guess which number is the target when a line has ambiguous values', () => {
    expect(parseGoalDocumentText('Abordagens: 8 / 20\nCarros: 1 / 3')).toEqual({ targets: {}, customGoals: [] });
  });

  test('does not convert negative targets or progress into positive suggestions', () => {
    expect(parseGoalDocumentText('Abordagens: meta -20\nCarros: meta -3 carros\nCarros entregues: atual -1, meta 3 carros')).toEqual({ targets: {}, customGoals: [] });
  });

  test('does not mistake a custom label containing a metric alias for a fixed CRM metric', () => {
    expect(parseGoalDocumentText('Custo por venda: meta R$ 5')).toEqual({
      targets: {},
      customGoals: [{ name: 'Custo por venda', unit: 'R$', target: 5, current: 0 }]
    });
  });

  test('returns an empty draft for blank or non-goal text', () => {
    expect(parseGoalDocumentText('   \nPlano comercial\nResultados do time')).toEqual({ targets: {}, customGoals: [] });
  });

  test('extracts selectable text from a local PDF file', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText('Abordagens: 500', { x: 36, y: 760, font, size: 12 });
    const file = new File([(await document.save()).slice().buffer as ArrayBuffer], 'metas.pdf', { type: 'application/pdf' });

    await expect(readGoalPdfText(file)).resolves.toContain('Abordagens: 500');
  });

  test('rejects a file larger than the local parsing limit before reading it', async () => {
    const file = { name: 'metas.pdf', type: 'application/pdf', size: MAX_GOAL_PDF_BYTES + 1 } as File;
    await expect(readGoalPdfText(file)).rejects.toThrow('no máximo 10 MB');
  });

  test('rejects a non-PDF file before attempting to parse it', async () => {
    const file = { name: 'metas.png', type: 'image/png', size: 100 } as File;
    await expect(readGoalPdfText(file)).rejects.toThrow('Selecione um arquivo PDF');
  });

  test('rejects a valid PDF with no selectable text', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const file = new File([(await document.save()).slice().buffer as ArrayBuffer], 'metas-vazias.pdf', { type: 'application/pdf' });

    await expect(readGoalPdfText(file)).rejects.toThrow('Não encontrei texto selecionável');
  });

  test('rejects PDFs with more than one hundred pages', async () => {
    const document = await PDFDocument.create();
    for (let page = 0; page < 101; page += 1) document.addPage();
    const file = new File([(await document.save()).slice().buffer as ArrayBuffer], 'metas-longas.pdf', { type: 'application/pdf' });

    await expect(readGoalPdfText(file)).rejects.toThrow('no máximo 100 páginas');
  });

  test('rejects documents whose extracted text exceeds the processing limit', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = document.addPage();
      for (let line = 0; line < 600; line += 1) page.drawText('A'.repeat(100), { x: 36, y: 760 - line, font, size: 8 });
    }
    const bytes = await document.save();
    const file = new File([bytes.slice().buffer as ArrayBuffer], 'metas-extensas.pdf', { type: 'application/pdf' });
    expect(file.size).toBeLessThanOrEqual(MAX_GOAL_PDF_BYTES);

    await expect(readGoalPdfText(file)).rejects.toThrow('texto demais para processar');
  });
});
