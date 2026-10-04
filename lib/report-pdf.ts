import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type ReportPdfSection = { title: string; lines: string[] };

export type ReportPdfInput = {
  title: string;
  subtitle: string;
  exportedAt: Date;
  sections: ReportPdfSection[];
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 46;
const lime = rgb(0.71, 1, 0.21);
const ink = rgb(0.08, 0.11, 0.12);
const muted = rgb(0.36, 0.4, 0.41);
const line = rgb(0.86, 0.88, 0.88);

function printableText(value: string) {
  return value.normalize('NFC')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00b7\u2022]/g, ' - ')
    .replace(/\u00f7/g, '/')
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(value: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, width: number) {
  const words = printableText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > width) {
      if (current) lines.push(current);
      current = '';
      for (const character of word) {
        if (current && font.widthOfTextAtSize(current + character, size) > width) {
          lines.push(current);
          current = character;
        } else {
          current += character;
        }
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

export async function createReportPdf({ title, subtitle, exportedAt, sections }: ReportPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(printableText(title));
  document.setSubject(printableText(subtitle));
  document.setAuthor('Arvello');
  document.setCreator('Arvello');

  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const generatedLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
  }).format(exportedAt);
  let page = document.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - 140;

  const drawHeader = (currentPage: typeof page) => {
    currentPage.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: lime });
    currentPage.drawText('ARVELLO', { x: margin, y: pageHeight - 35, size: 9, font: boldFont, color: ink });
    currentPage.drawText('RELATORIOS COMERCIAIS', { x: pageWidth - margin - 122, y: pageHeight - 35, size: 8, font: regularFont, color: muted });
    currentPage.drawText(printableText(title), { x: margin, y: pageHeight - 75, size: 21, font: boldFont, color: ink });

    const wrappedSubtitle = wrapText(subtitle, regularFont, 9, pageWidth - margin * 2);
    wrappedSubtitle.slice(0, 2).forEach((text, index) => {
      currentPage.drawText(text, { x: margin, y: pageHeight - 95 - index * 13, size: 9, font: regularFont, color: muted });
    });
    currentPage.drawText(`Exportado em ${generatedLabel}`, {
      x: margin, y: pageHeight - 123, size: 8, font: regularFont, color: muted
    });
    currentPage.drawRectangle({ x: margin, y: pageHeight - 132, width: pageWidth - margin * 2, height: 1, color: line });
  };

  drawHeader(page);

  const nextPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    drawHeader(page);
    cursorY = pageHeight - 140;
  };
  const ensureRoom = (height: number) => {
    if (cursorY - height < margin + 22) nextPage();
  };

  for (const section of sections) {
    const titleLines = wrapText(section.title, boldFont, 12, pageWidth - margin * 2);
    ensureRoom(24 + titleLines.length * 15);
    for (const titleLine of titleLines) {
      page.drawText(titleLine, { x: margin, y: cursorY, size: 12, font: boldFont, color: ink });
      cursorY -= 16;
    }

    for (const lineText of section.lines.length ? section.lines : ['Nenhum registro neste periodo.']) {
      const wrappedLines = wrapText(lineText, regularFont, 9.5, pageWidth - margin * 2 - 15);
      for (let index = 0; index < wrappedLines.length; index += 1) {
        ensureRoom(14);
        if (index === 0) page.drawCircle({ x: margin + 3, y: cursorY + 3, size: 2, color: lime });
        page.drawText(wrappedLines[index], { x: margin + 13, y: cursorY, size: 9.5, font: regularFont, color: muted });
        cursorY -= 14;
      }
    }
    cursorY -= 10;
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawRectangle({ x: margin, y: 37, width: pageWidth - margin * 2, height: 1, color: line });
    currentPage.drawText('Arvello | Relatorio gerado a partir dos dados do CRM.', {
      x: margin, y: 24, size: 7.5, font: regularFont, color: muted
    });
    const pageNumber = `${index + 1} / ${pages.length}`;
    currentPage.drawText(pageNumber, {
      x: pageWidth - margin - regularFont.widthOfTextAtSize(pageNumber, 7.5),
      y: 24, size: 7.5, font: regularFont, color: muted
    });
  });

  return document.save();
}
