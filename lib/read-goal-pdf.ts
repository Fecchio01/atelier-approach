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
      const pageText = content.items.flatMap((item) => {
        if (typeof item !== 'object' || item === null || !('str' in item) || typeof item.str !== 'string') return [];
        return [`${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`];
      }).join('').trim();
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
