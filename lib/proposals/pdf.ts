import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type ProposalSnapshot = {
  version: number; status: string; customerName: string; notes: string | null; validUntil: Date | null;
  saleValue: { toString(): string }; mrr: { toString(): string };
  lineItems: Array<{ serviceName: string; description: string; price: { toString(): string }; billingType: string; quantity: number }>;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export async function renderProposalPdf(proposal: ProposalSnapshot) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - 54;
  const margin = 48;
  const width = page.getWidth() - margin * 2;
  const addPageIfNeeded = (height: number) => { if (y - height < 52) { page = pdf.addPage(pageSize); y = page.getHeight() - 54; } };
  const drawWrapped = (text: string, size = 10, font = regular, color = rgb(0.18, 0.22, 0.25), gap = 4) => {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(attempt, size) > width && line) { lines.push(line); line = word; } else line = attempt;
    }
    if (line) lines.push(line);
    addPageIfNeeded(lines.length * (size + gap));
    for (const wrapped of lines) { page.drawText(wrapped, { x: margin, y, size, font, color }); y -= size + gap; }
  };
  page.drawText('PROPOSTA COMERCIAL', { x: margin, y, size: 19, font: bold, color: rgb(0.28, 0.38, 0.08) }); y -= 32;
  drawWrapped(`Versão ${proposal.version} · ${proposal.status === 'APPROVED' ? 'Aprovada internamente' : 'Rascunho para revisão'}`, 9, regular, rgb(0.4, 0.43, 0.45));
  y -= 10;
  drawWrapped(`Empresa: ${proposal.customerName}`, 12, bold);
  drawWrapped(`Emissão: ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`);
  if (proposal.validUntil) drawWrapped(`Validade: ${new Intl.DateTimeFormat('pt-BR').format(proposal.validUntil)}`);
  y -= 10;
  for (const item of proposal.lineItems) {
    addPageIfNeeded(72);
    page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 0.7, color: rgb(0.83, 0.85, 0.86) }); y -= 16;
    drawWrapped(`${item.serviceName} · ${currency.format(Number(item.price))}${item.billingType === 'MONTHLY' ? ' / mês' : ' · pagamento único'}`, 11, bold);
    drawWrapped(item.description, 9, regular, rgb(0.35, 0.38, 0.4));
    y -= 8;
  }
  y -= 8;
  drawWrapped(`Valor da venda: ${currency.format(Number(proposal.saleValue))}`, 11, bold);
  drawWrapped(`MRR: ${currency.format(Number(proposal.mrr))}`, 11, bold);
  if (proposal.notes) { y -= 14; drawWrapped('Condições e observações', 11, bold); drawWrapped(proposal.notes, 9); }
  y -= 22;
  drawWrapped('Este arquivo é uma cópia da versão imutável salva no CRM. Gerar ou baixar o PDF não registra envio nem altera a etapa do funil.', 8, regular, rgb(0.4, 0.43, 0.45));
  return new Uint8Array(await pdf.save());
}
