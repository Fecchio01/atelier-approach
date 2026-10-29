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

export function chooseDailyProspectingTarget(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = Date.UTC(year, month - 1, day);
  const origin = Date.UTC(2026, 0, 1);
  const ordinal = Math.floor((date - origin) / 86_400_000);
  const niche = NICHE_CYCLE[((ordinal % NICHE_CYCLE.length) + NICHE_CYCLE.length) % NICHE_CYCLE.length];
  const cityIndex = Math.floor(Math.max(0, ordinal) / NICHE_CYCLE.length) % CITY_CYCLE.length;
  const [city, state] = CITY_CYCLE[cityIndex];
  return { niche: niche.name, nicheTerms: [...niche.terms], city, region: `${city}, ${state}` };
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
  const normalized = normalize(`${input.name} ${input.category ?? ''}`);
  const target = chooseTermsForNiche(input.niche);
  const matchedTerms = target.filter((term) => normalized.includes(normalize(term)));
  const fitScore = matchedTerms.length ? 85 : input.category ? 58 : 45;
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
    ? 'Há divergência de identidade nos dados coletados; confira o perfil da empresa antes de abordar.'
    : matchedTerms.length
      ? `O nome ou categoria contém correspondência com ${matchedTerms.slice(0, 2).join(' / ')}.`
      : input.category
        ? `A fonte classifica a empresa como ${input.category}; a correspondência com o nicho precisa de conferência.`
        : 'A categoria não veio informada pela fonte; confira a empresa antes de priorizar.';
  const recommendation = input.status === 'REVIEW_IDENTITY'
    ? 'Conferir identidade'
    : fitScore >= 80
      ? 'Boa candidata para avaliação comercial'
      : 'Validar dados antes de priorizar';

  const result = {
    version: 'prospect-analysis-v1',
    niche: input.niche,
    fitScore,
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
  const entry = NICHE_CYCLE.find((candidate) => normalize(candidate.name) === normalize(niche));
  return entry ? [entry.name, ...entry.terms] : [niche];
}
