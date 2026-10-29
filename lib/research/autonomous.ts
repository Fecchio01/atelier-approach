import type { Prisma } from '@prisma/client';

export const AUTONOMOUS_CAMPAIGN_OWNER_ID = 'team';

const NICHE_CYCLE = [
  { name: 'barbearia', terms: ['barber', 'barber shop', 'barbershop'] },
  { name: 'salão de beleza', terms: ['beauty salon', 'hair salon'] },
  { name: 'clínica odontológica', terms: ['dentist', 'dental', 'dental clinic'] },
  { name: 'academia', terms: ['gym', 'fitness center'] },
  { name: 'cafeteria', terms: ['cafe', 'coffee shop', 'coffeehouse', 'coffee roaster'] },
  { name: 'restaurante', terms: ['restaurant'] },
  { name: 'imobiliária', terms: ['real estate agency', 'real estate'] },
  { name: 'pet shop', terms: ['pet shop', 'pet store', 'pet supply'] },
  { name: 'oficina mecânica', terms: ['automotive repair', 'auto repair', 'mechanic'] },
  { name: 'estética automotiva', terms: ['auto detailing', 'car detailing', 'auto repair', 'car wash'] }
] as const;

export const AUTONOMOUS_PROSPECTING_NICHE_SUGGESTIONS = NICHE_CYCLE.map(({ name }) => name);

const CITY_CYCLE = [
  ['Rio de Janeiro', 'RJ'], ['São Paulo', 'SP'], ['Salvador', 'BA'], ['Belo Horizonte', 'MG'],
  ['Curitiba', 'PR'], ['Porto Alegre', 'RS'], ['Brasília', 'DF'], ['Recife', 'PE'],
  ['Fortaleza', 'CE'], ['Manaus', 'AM'], ['Belém', 'PA'], ['Goiânia', 'GO'],
  ['Florianópolis', 'SC'], ['Vitória', 'ES'], ['Natal', 'RN'], ['João Pessoa', 'PB'],
  ['Maceió', 'AL'], ['Aracaju', 'SE'], ['Teresina', 'PI'], ['São Luís', 'MA'],
  ['Campo Grande', 'MS'], ['Cuiabá', 'MT'], ['Palmas', 'TO'], ['Porto Velho', 'RO'],
  ['Rio Branco', 'AC'], ['Boa Vista', 'RR'], ['Macapá', 'AP']
] as const;

export function getSaoPauloDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function chooseDailyProspectingTarget(dateKey: string, configuredNiches: string[] = []) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = Date.UTC(year, month - 1, day);
  const origin = Date.UTC(2026, 0, 1);
  const ordinal = Math.floor((date - origin) / 86_400_000);
  const nicheCycle = configuredNiches.length
    ? configuredNiches.map((name) => ({ name, terms: [name] }))
    : NICHE_CYCLE;
  const nicheIndex = configuredNiches.length
    ? ((ordinal % nicheCycle.length) + nicheCycle.length) % nicheCycle.length
    : hashDateSeed(dateKey) % nicheCycle.length;
  const niche = nicheCycle[nicheIndex];
  const cityIndex = Math.floor(Math.max(0, ordinal) / nicheCycle.length) % CITY_CYCLE.length;
  const [city, state] = CITY_CYCLE[cityIndex];
  return { niche: niche.name, nicheTerms: [...niche.terms], city, region: `${city}, ${state}` };
}

function hashDateSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function analyzeProspect(input: {
  niche: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'NEW' | 'REVIEW_IDENTITY' | 'APPROVED' | 'REJECTED' | 'PROMOTED';
}) {
  const target = chooseTermsForNiche(input.niche);
  const normalizedName = normalize(input.name);
  const normalizedCategory = normalize(input.category ?? '');
  const nameMatches = target.filter((term) => normalizedName.includes(normalize(term)));
  const categoryMatches = target.filter((term) => normalizedCategory.includes(normalize(term)));
  const matchedTerms = Array.from(new Set([...categoryMatches, ...nameMatches]));
  const matchBasis = categoryMatches.length && nameMatches.length ? 'NAME_AND_CATEGORY'
    : categoryMatches.length ? 'CATEGORY' : nameMatches.length ? 'NAME' : 'NONE';
  const baseFitScore = matchBasis === 'NAME_AND_CATEGORY' ? 96
    : matchBasis === 'CATEGORY' ? 88
      : matchBasis === 'NAME' ? 66
        : input.category ? 42 : 30;
  // Identity conflicts lower trust in the association even when terms match.
  const fitScore = input.status === 'REVIEW_IDENTITY' ? Math.min(baseFitScore, 45) : baseFitScore;
  const dataPoints = [
    input.name.trim().length > 2,
    Boolean(input.category), Boolean(input.address),
    Number.isFinite(input.latitude) && Number.isFinite(input.longitude),
    Boolean(input.phone), Boolean(input.website), Boolean(input.instagram), Boolean(input.whatsapp)
  ];
  const completeness = Math.round((dataPoints.filter(Boolean).length / dataPoints.length) * 100);
  const availableChannels = [
    input.phone ? 'telefone' : null,
    input.website ? 'site' : null,
    input.instagram ? 'Instagram' : null,
    input.whatsapp ? 'WhatsApp' : null
  ].filter((value): value is string => Boolean(value));
  const summary = input.status === 'REVIEW_IDENTITY'
    ? `Há divergência de identidade nos dados coletados${matchedTerms.length ? `; termos relacionados encontrados em ${matchBasis === 'NAME_AND_CATEGORY' ? 'nome e categoria' : matchBasis === 'CATEGORY' ? 'categoria' : 'nome'} (${matchedTerms.slice(0, 2).join(' / ')})` : ''}. Confira o perfil da empresa antes de adicionar ao funil.`
    : matchBasis !== 'NONE'
      ? `Correspondência encontrada em ${matchBasis === 'NAME_AND_CATEGORY' ? 'nome e categoria' : matchBasis === 'CATEGORY' ? 'categoria' : 'nome'}: ${matchedTerms.slice(0, 3).join(' / ')}.`
      : input.category
        ? `A fonte classifica como ${input.category}, mas não há correspondência textual direta com ${input.niche}; confira antes de priorizar.`
        : `Não há correspondência textual direta com ${input.niche} e a categoria não veio informada; confira antes de priorizar.`;
  const recommendation = input.status === 'REVIEW_IDENTITY'
    ? 'Conferir identidade'
    : fitScore >= 80
      ? 'Boa correspondência para revisar'
      : 'Validar dados antes de priorizar';

  const result = {
    version: 'prospect-analysis-v1',
    niche: input.niche,
    fitScore,
    matchBasis,
    dataCompleteness: completeness,
    recommendation,
    summary,
    availableChannels,
    matchedTerms: matchedTerms.slice(0, 3),
    analyzedBy: 'Análise local baseada em correspondência textual e campos publicados pela fonte Overture; não confirma a veracidade dos dados e não usa modelo externo.'
  } satisfies Prisma.InputJsonObject;

  return result;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[_-]+/g, ' ');
}

function chooseTermsForNiche(niche: string) {
  const normalized = normalize(niche).replace(/\s+/g, ' ').trim();
  const entry = NICHE_CYCLE.find((candidate) => normalize(candidate.name) === normalized);
  if (entry) return [entry.name, ...entry.terms];
  const nicheAliases: Record<string, string[]> = {
    pilates: ['pilates studio', 'pilates studios'],
    'estudio de pilates': ['pilates', 'pilates studio'],
    'estudios de pilates': ['pilates', 'pilates studio'],
    'studio de pilates': ['pilates', 'pilates studio'],
    'studios de pilates': ['pilates', 'pilates studio']
  };
  return nicheAliases[normalized] ?? [niche];
}
