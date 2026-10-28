import { createHash } from 'node:crypto';

import { leadAnalysisSchema, type LeadAnalysis } from '../contracts';

export const COMMERCIAL_ANALYSIS_VERSION = 'commercial-analysis-v1';

type LeadFacts = {
  id: string; version: number; name: string | null; category: string | null; address: string | null;
  phone: string | null; whatsapp: string | null; website: string | null; instagram: string | null;
  stage: string; evidence: Array<{ id: string; field: string; value: string | null; sourceUrl: string; verified: boolean }>;
};
type CatalogService = { id: string; name: string; scope: string | null; deliverables: string | null; restrictions: string | null };

const crmFactFields = [
  ['name', 'Nome cadastrado'], ['category', 'Categoria cadastrada'], ['address', 'Endereço cadastrado'],
  ['phone', 'Telefone cadastrado'], ['whatsapp', 'WhatsApp cadastrado'], ['website', 'Site cadastrado'], ['instagram', 'Instagram cadastrado']
] as const;

/** Builds a source-linked, deterministic diagnosis. It never asks a model to invent facts. */
export function analyzeCompany(input: LeadFacts, services: CatalogService[]): {
  evidenceFingerprint: string; result: Pick<LeadAnalysis, 'commercialAnalysis' | 'strategy'>;
} {
  const knownFacts: Array<{ label: string; value: string; evidenceId: string }> = crmFactFields.flatMap(([field, label]) => {
    const value = input[field];
    return typeof value === 'string' && value.trim()
      ? [{ label, value: value.trim().slice(0, 240), evidenceId: `crm:${field}` }]
      : [];
  });
  const verifiedEvidence = input.evidence.filter((evidence) => evidence.verified && evidence.value?.trim());
  for (const evidence of verifiedEvidence) {
    knownFacts.push({ label: `${evidence.field} (fonte registrada)`, value: evidence.value!.trim().slice(0, 240), evidenceId: evidence.id });
  }
  const present = new Set(knownFacts.map((fact) => fact.evidenceId.replace('crm:', '')));
  const unknowns = [
    !present.has('category') ? 'Categoria/nicho não está confirmado no cadastro.' : null,
    !present.has('website') ? 'Não há site disponível para revisar.' : null,
    !present.has('phone') && !present.has('whatsapp') ? 'Não há telefone publicado no cadastro.' : null,
    !verifiedEvidence.length ? 'Nenhuma evidência externa verificada está vinculada a esta empresa.' : null,
    'Necessidade comercial, orçamento e resultados da empresa não foram verificados.'
  ].filter((value): value is string => Boolean(value));

  const category = input.category?.trim().toLocaleLowerCase('pt-BR') ?? '';
  const suggestions = category
    ? services.filter((service) => {
      const scopeTerms = `${service.name} ${service.scope ?? ''} ${service.deliverables ?? ''}`.toLocaleLowerCase('pt-BR');
      return category.split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 4).some((term) => scopeTerms.includes(term));
    }).slice(0, 5).map((service) => ({
      serviceId: service.id,
      serviceName: service.name,
      reason: `Correspondência textual entre a categoria cadastrada e o escopo/entregáveis do serviço. Revisão humana necessária.`
    }))
    : [];

  const fit = services.length === 0 ? 'NO_CATALOG' : !category ? 'INSUFFICIENT_DATA' : suggestions.length ? 'POTENTIAL_MATCH' : 'NO_MATCH';
  const dataQuality = knownFacts.length >= 6 ? 'GOOD' : knownFacts.length >= 3 ? 'PARTIAL' : 'LIMITED';
  const nextStep = !input.phone && !input.whatsapp && !input.website && !input.instagram
    ? 'Revisar os dados de contato antes de planejar uma abordagem.'
    : input.stage === 'PROPOSAL'
      ? 'Revisar manualmente se a proposta enviada recebeu retorno.'
      : input.stage === 'MEETING'
        ? 'Preparar a reunião e confirmar data e participantes.'
        : 'Revisar o cadastro e escolher manualmente o próximo contato.';
  const result = leadAnalysisSchema.shape.commercialAnalysis.parse({
    version: COMMERCIAL_ANALYSIS_VERSION,
    fit,
    dataQuality,
    knownFacts: knownFacts.slice(0, 12),
    unknowns: unknowns.slice(0, 12),
    serviceSuggestions: suggestions
  });
  const strategy = leadAnalysisSchema.shape.strategy.parse({
    version: 'commercial-strategy-v1',
    nextStep,
    reason: services.length === 0
      ? 'O catálogo de serviços está vazio; nenhuma oferta, preço ou resultado foi presumido.'
      : 'Próximo passo baseado somente na etapa e nos dados disponíveis; confirme o contexto antes de agir.',
    requiresHumanReview: true
  });
  const evidenceFingerprint = createHash('sha256')
    .update(JSON.stringify({ id: input.id, version: input.version, knownFacts, verifiedEvidence: verifiedEvidence.map((item) => [item.id, item.value, item.verified]), services: services.map((service) => [service.id, service.scope, service.deliverables]) }))
    .digest('hex');
  return { evidenceFingerprint, result: { commercialAnalysis: result, strategy } };
}
