export type MapsPhoneLookupInput = {
  name: string;
  address?: string | null;
  city: string;
  region: string;
};

export type MapsPhoneCandidate = {
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
};

export type MapsPhoneCandidateMatch =
  | { status: 'matched'; candidate: MapsPhoneCandidate }
  | { status: 'none' | 'ambiguous' };

const BRAZILIAN_STATES: Record<string, string> = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara', DF: 'distrito federal',
  ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MT: 'mato grosso', MS: 'mato grosso do sul',
  MG: 'minas gerais', PA: 'para', PB: 'paraiba', PR: 'parana', PE: 'pernambuco', PI: 'piaui',
  RJ: 'rio de janeiro', RN: 'rio grande do norte', RS: 'rio grande do sul', RO: 'rondonia', RR: 'roraima',
  SC: 'santa catarina', SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins'
};

const LEGAL_SUFFIXES = ['s a', 'ltda', 'limitada', 'eireli', 'epp', 'mei', 'me', 'sa'];

export function normalizeMapsPhoneText(value: string) {
  const normalized = value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const tokens = normalized.split(' ').filter(Boolean);
  let removedSuffix = true;
  while (removedSuffix && tokens.length) {
    removedSuffix = false;
    for (const suffix of LEGAL_SUFFIXES) {
      const suffixTokens = suffix.split(' ');
      if (suffixTokens.every((token, index) => tokens[tokens.length - suffixTokens.length + index] === token)) {
        tokens.splice(-suffixTokens.length);
        removedSuffix = true;
        break;
      }
    }
  }
  return tokens.join(' ');
}

function normalizeRegion(region: string | null | undefined) {
  if (!region) return '';
  const normalized = normalizeMapsPhoneText(region).toUpperCase();
  const code = Object.keys(BRAZILIAN_STATES).find((stateCode) => stateCode === normalized);
  if (code) return BRAZILIAN_STATES[code];
  return normalizeMapsPhoneText(region);
}

function diceSimilarity(first: string, second: string) {
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;
  const bigrams = (value: string) => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const bigram = value.slice(index, index + 2);
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }
    return counts;
  };
  const firstBigrams = bigrams(first);
  const secondBigrams = bigrams(second);
  let overlap = 0;
  for (const [bigram, count] of firstBigrams) overlap += Math.min(count, secondBigrams.get(bigram) ?? 0);
  return (2 * overlap) / (first.length - 1 + second.length - 1);
}

function addressMatches(inputAddress: string | null | undefined, candidateAddress: string | null) {
  if (!inputAddress?.trim()) return true;
  if (!candidateAddress?.trim()) return false;
  const inputHouseNumber = explicitHouseNumber(inputAddress);
  const candidateHouseNumber = explicitHouseNumber(candidateAddress);
  if (inputHouseNumber && candidateHouseNumber && inputHouseNumber !== candidateHouseNumber) return false;
  const input = normalizeMapsPhoneText(inputAddress);
  const candidate = normalizeMapsPhoneText(candidateAddress);
  return input.length > 0 && candidate.length > 0 && diceSimilarity(input, candidate) >= 0.75;
}

function explicitHouseNumber(address: string) {
  const afterComma = /[,;]\s*(?:n(?:[º°o.]|o)?\s*)?(\d+[a-z]?)(?=\D|$)/iu.exec(address);
  if (afterComma) return afterComma[1].toLocaleLowerCase('pt-BR');

  const normalized = normalizeMapsPhoneText(address);
  const markedNumber = /(?:^|\s)(?:n|numero)\s+(\d+[a-z]?)(?=\s|$)/u.exec(normalized);
  if (markedNumber) return markedNumber[1];

  const streetSegment = address.split(/[,;]/u, 1)[0];
  const trailingNumber = /(?:^|\s)(\d+[a-z]?)\s*$/iu.exec(streetSegment);
  return trailingNumber?.[1]?.toLocaleLowerCase('pt-BR') ?? null;
}

export function matchMapsPhoneCandidate(
  input: MapsPhoneLookupInput,
  candidates: MapsPhoneCandidate[]
): MapsPhoneCandidateMatch {
  const inputName = normalizeMapsPhoneText(input.name);
  const inputCity = normalizeMapsPhoneText(input.city);
  const inputRegion = normalizeRegion(input.region);
  const matches = candidates.filter((candidate) => {
    const candidateName = normalizeMapsPhoneText(candidate.name);
    const nameMatches = candidateName.length > 0 && diceSimilarity(inputName, candidateName) >= 0.88;
    return nameMatches
      && normalizeMapsPhoneText(candidate.city ?? '') === inputCity
      && normalizeRegion(candidate.region) === inputRegion
      && addressMatches(input.address, candidate.address);
  });

  if (matches.length === 1) return { status: 'matched', candidate: matches[0] };
  return { status: matches.length > 1 ? 'ambiguous' : 'none' };
}
