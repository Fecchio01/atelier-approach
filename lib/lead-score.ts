import type { ExternalBusiness } from './osm';

export type BusinessScore = {
  score: number;
  reasons: string[];
};

export function approachabilityRank(business: ExternalBusiness) {
  if (business.whatsapp && business.instagram) return 0;
  if (business.whatsapp) return 1;
  if (business.instagram || business.website) return 2;
  if (business.phone) return 3;
  return 4;
}

export function scoreBusiness(business: ExternalBusiness): BusinessScore {
  const reasons: string[] = [];

  if (!business.phone) {
    reasons.push('Sem telefone cadastrado');
  }

  if (!business.website && !business.instagram) {
    reasons.push('Sem presença digital cadastrada');
  } else if (!business.website) {
    reasons.push('Sem site cadastrado');
  } else if (!business.instagram) {
    reasons.push('Sem Instagram cadastrado');
  }

  const missingDigital = Number(!business.website) * 20 + Number(!business.instagram) * 15;

  return {
    score: 15 + Number(!business.phone) * 20 + missingDigital,
    reasons
  };
}
