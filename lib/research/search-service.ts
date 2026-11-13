import { enrichOvertureBusinesses } from '@/lib/prospect-enrichment';
import { createOsmSearchService } from '@/lib/osm';
import type { SearchBounds, ExternalBusiness } from '@/lib/osm';
import {
  getOvertureRelease,
  planOvertureSearchAreas,
  searchOvertureArea,
  splitOvertureSearchArea,
  type OvertureSearchArea
} from '@/lib/overture';

export type ProspectSearchCriteria = { niche: string; businessName?: string; release?: string };

const boundsService = createOsmSearchService();

export async function resolveProspectSearchPlan(input: {
  region: string;
  city?: string;
  national?: boolean;
  maxAreas?: number;
}) {
  const bounds = await boundsService.resolveSearchBounds(input.region, input.city, input.national ?? false);
  if (!bounds) throw new Error('Não foi possível resolver os limites desta região.');
  const plannedAreas = planOvertureSearchAreas(bounds, input.national ?? false, input.region);
  const maxAreas = input.maxAreas ?? 20;
  return {
    release: await getOvertureRelease(),
    areas: plannedAreas.slice(0, maxAreas),
    areaPlanTruncated: plannedAreas.length > maxAreas
  };
}

export async function searchProspectArea(area: OvertureSearchArea, criteria: ProspectSearchCriteria) {
  return searchOvertureArea(area, criteria);
}

export async function enrichProspectBatch(businesses: ExternalBusiness[]) {
  return enrichOvertureBusinesses(businesses);
}

export function splitProspectSearchArea(area: OvertureSearchArea) {
  return splitOvertureSearchArea(area);
}

export type { ExternalBusiness, OvertureSearchArea, SearchBounds };
