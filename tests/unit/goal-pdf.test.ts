import { describe, expect, test } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { parseGoalDocumentText } from '../../lib/goal-pdf';
import { applyGoalSuggestions } from '../../lib/goal-import-state';
import { MAX_GOAL_PDF_BYTES, readGoalPdfText } from '../../lib/read-goal-pdf';

describe('PDF goal text suggestions', () => {
  test('custom PDF suggestions retain manual progress when applied to the goal form', () => {
    const parsed = parseGoalDocumentText('Conversas humanas: atual 2, meta 10 conversas');
    const applied = applyGoalSuggestions({}, [], parsed.customGoals.map((goal, index) => ({
      ...goal, id: `pdf-${index}`, target: String(goal.target), current: String(goal.current), destination: 'custom' as const, icon: 'target' as const
    })));
    expect(applied.customGoals).toEqual([{ id: 'pdf-0', name: 'Conversas humanas', unit: 'conversas', target: 10, current: 2, icon: 'target', source: 'manual' }]);
  });
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

  test('imports metric rows from a visually column-aligned weekly goals PDF', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const columns = [56, 195, 261];
    const drawRow = (y: number, cells: [string, string, string]) => {
      cells.forEach((cell, index) => page.drawText(cell, { x: columns[index], y, font, size: 10 }));
    };

    drawRow(760, ['INDICADOR', 'META', 'CRITERIO DE CONTAGEM']);
    drawRow(735, ['Empresas aprovadas', '50', '10 por dia útil; nicho e região corretos']);
    drawRow(710, ['Conversas humanas', '10', 'Conversas iniciadas com decisores']);
    drawRow(685, ['Dores confirmadas', '3', 'Necessidade e impacto registrados']);
    drawRow(660, ['Oportunidade real', '1', 'Empresa dentro do perfil comercial']);
    drawRow(635, ['Repetições / fora do perfil', '0', '10 registros conferidos; nenhuma repetição permitida']);
    drawRow(610, ['Follow-ups vencidos', '100%', 'Todos os retornos feitos no prazo']);
    page.drawText('DISTRIBUIÇÃO DIÁRIA', { x: 48, y: 585, font, size: 10 });
    page.drawText('ATELIER OS · PLANEJAMENTO COMERCIAL', { x: 48, y: 22, font, size: 10 });
    page.drawText('01', { x: 539, y: 22, font, size: 10 });
    const file = new File([(await document.save()).slice().buffer as ArrayBuffer], 'metas-semanais.pdf', { type: 'application/pdf' });

    const text = await readGoalPdfText(file);
    expect(parseGoalDocumentText(text)).toEqual({
      targets: {},
      customGoals: [
        { name: 'Empresas aprovadas', target: 50, current: 0 },
        { name: 'Conversas humanas', target: 10, current: 0 },
        { name: 'Dores confirmadas', target: 3, current: 0 },
        { name: 'Oportunidade real', target: 1, current: 0 },
        { name: 'Repetições / fora do perfil', target: 0, current: 0 },
        { name: 'Follow-ups vencidos', unit: '%', target: 100, current: 0 }
      ]
    });
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
