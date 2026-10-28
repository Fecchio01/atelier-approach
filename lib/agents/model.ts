import { createHash } from 'node:crypto';

import { leadAnalysisSchema, type LeadAnalysis } from './contracts';

export type LeadModelInput = {
  id: string;
  version: number;
  name: string;
  stage: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  category: string | null;
};

/** Deterministic first release: only summarizes fields already stored by the CRM. */
export function analyzeLead(input: LeadModelInput, now = new Date()): LeadAnalysis {
  const knownFacts = [
    input.category ? `Categoria registrada: ${input.category}.` : null,
    input.stage ? `Etapa atual: ${input.stage}.` : null,
    input.whatsapp ? 'Há um número identificado como WhatsApp salvo no cadastro.' : null,
    input.phone ? 'Há um telefone salvo no cadastro.' : null,
    input.website ? 'Há um site salvo no cadastro.' : null,
    input.instagram ? 'Há um perfil de Instagram salvo no cadastro.' : null,
    input.address ? 'Há um endereço salvo no cadastro.' : null
  ].filter((fact): fact is string => Boolean(fact));
  const unknowns = [
    !input.phone && !input.whatsapp ? 'Telefone/WhatsApp não consta no cadastro.' : null,
    !input.website ? 'Site não consta no cadastro.' : null,
    !input.instagram ? 'Instagram não consta no cadastro.' : null,
    !input.address ? 'Endereço não consta no cadastro.' : null,
    'Nenhum dado foi verificado fora do CRM nesta análise.'
  ].filter((value): value is string => Boolean(value));
  const availableFields = [input.phone || input.whatsapp, input.website, input.instagram, input.address, input.category].filter(Boolean).length;
  const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const taskType = input.whatsapp ? 'WHATSAPP' : input.phone ? 'PHONE' : 'OTHER';
  const channelLabel = input.whatsapp ? 'WhatsApp' : input.phone ? 'telefone' : 'contato';

  return leadAnalysisSchema.parse({
    engine: 'RULES',
    model: null,
    usage: null,
    summary: `${input.name}: revisar o próximo contato usando os dados já disponíveis no CRM. Esta sugestão não confirma informações externas.`,
    dataCoverage: Math.round(availableFields / 5 * 100),
    knownFacts,
    unknowns,
    recommendation: {
      title: input.whatsapp || input.phone ? `Revisar contato por ${channelLabel} — ${input.name}` : `Validar canal de contato — ${input.name}`,
      description: 'Sugestão criada a partir do cadastro existente. Confira a empresa e os dados antes de qualquer contato; nenhum envio será feito pelo sistema.',
      dueDate: dueDate.toISOString(),
      taskType,
      priority: input.stage === 'PROPOSAL' ? 'HIGH' : 'NORMAL'
    }
  });
}

export function hashApproval(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
