export const MAX_GOAL_PDF_BYTES = 10 * 1024 * 1024;
const MAX_GOAL_PDF_PAGES = 100;
const MAX_GOAL_PDF_TEXT_LENGTH = 200_000;

export class GoalPdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoalPdfReadError';
  }
}

async function loadPdfJs() {
  if (typeof window === 'undefined') return import('pdfjs-dist/legacy/build/pdf.mjs');
  const moduleUrl = new URL('/pdfjs/pdf.min.mjs', window.location.origin).href;
  return (await import(/* webpackIgnore: true */ moduleUrl)) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
}

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null
    && 'str' in item && typeof item.str === 'string';
}

function extractPageText(items: unknown[]) {
  const lines: string[] = [];
  let line: Array<{ text: string; x: number; width: number }> = [];
  let baseline: number | undefined;

  const flushLine = () => {
    if (!line.length) return;
    line.sort((left, right) => left.x - right.x);
    let text = '';
    let previousEnd: number | undefined;
    for (const item of line) {
      if (text && previousEnd !== undefined) {
        const gap = item.x - previousEnd;
        text += gap >= 24 ? '\t' : ' ';
      }
      text += item.text;
      previousEnd = item.x + item.width;
    }
    if (text.trim()) lines.push(text.trim());
    line = [];
    baseline = undefined;
  };

  for (const rawItem of items) {
    if (!isPdfTextItem(rawItem)) continue;
    const item = rawItem;
    if (item.str.trim()) {
      const x = item.transform?.[4];
      const y = item.transform?.[5];
      if (typeof x === 'number' && typeof y === 'number') {
        if (baseline !== undefined && Math.abs(y - baseline) > 2) flushLine();
        baseline ??= y;
        line.push({ text: item.str.trim(), x, width: typeof item.width === 'number' ? item.width : 0 });
      } else {
        flushLine();
        lines.push(item.str.trim());
      }
    }
    if (item.hasEOL) flushLine();
  }

  flushLine();
  return lines.join('\n');
}

export async function readGoalPdfText(file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new GoalPdfReadError('Selecione um arquivo PDF.');
  }
  if (file.size <= 0) throw new GoalPdfReadError('O arquivo selecionado está vazio.');
  if (file.size > MAX_GOAL_PDF_BYTES) throw new GoalPdfReadError('O PDF deve ter no máximo 10 MB.');

  let loadingTask: { promise: Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }>; destroy: () => Promise<void> } | undefined;
  try {
    const pdfjs = await loadPdfJs();
    if (typeof window !== 'undefined') {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('/pdfjs/pdf.worker.min.mjs', window.location.origin).toString();
    }

    loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
    const document = await loadingTask.promise;
    if (document.numPages > MAX_GOAL_PDF_PAGES) {
      throw new GoalPdfReadError(`O PDF deve ter no máximo ${MAX_GOAL_PDF_PAGES} páginas.`);
    }
    const pages: string[] = [];
    let totalLength = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = extractPageText(content.items).trim();
      totalLength += pageText.length;
      if (totalLength > MAX_GOAL_PDF_TEXT_LENGTH) {
        throw new GoalPdfReadError('O PDF tem texto demais para processar. Divida o arquivo e tente novamente.');
      }
      if (pageText) pages.push(pageText);
    }

    const text = pages.join('\n');
    if (!text.trim()) throw new GoalPdfReadError('Não encontrei texto selecionável. PDFs escaneados não são aceitos nesta versão.');
    return text;
  } catch (error) {
    if (error instanceof GoalPdfReadError) throw error;
    throw new GoalPdfReadError('Não foi possível ler esse PDF. Tente outro arquivo.');
  } finally {
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }
}
