import type { Prisma } from '@prisma/client';

import type { ExternalBusiness } from '@/lib/osm';
import { analyzeProspect } from '@/lib/research/autonomous';

type CandidateQueries = Pick<Prisma.TransactionClient, 'prospectCandidate' | 'researchCampaignCandidate' | 'lead'>;
const AVAILABLE_CANDIDATE_STATUSES = ['NEW', 'REVIEW_IDENTITY', 'APPROVED'] as const;

/** Match the count shown in Darwin: campaign results that have not been rejected or discarded. */
export async function countVisibleCampaignCandidates(db: CandidateQueries, campaignId: string) {
  const linkedCandidates = await db.researchCampaignCandidate.findMany({
    where: {
      campaignId,
      candidate: {
        status: { not: 'REJECTED' },
        discardedAt: null
      }
    },
    select: { candidateId: true }
  });
  return linkedCandidates.length;
}

/** Avoid wasting enrichment and area capacity on previously discarded/promoted/CRM-linked leads. */
export async function filterAvailableCampaignBusinesses(
  db: CandidateQueries,
  campaignId: string,
  businesses: ExternalBusiness[]
) {
  if (!businesses.length) return [];

  const externalIds = [...new Set(businesses.map(({ osmId }) => osmId))];
  const sources = [...new Set(businesses.map(({ source }) => source ?? 'Overture'))];
  const normalizedNames = [...new Set(businesses.map(({ name }) => normalizeCandidateName(name)))];
  const [existingCandidates, linkedCandidates, existingLeads, sameIdentityCandidates] = await Promise.all([
    db.prospectCandidate.findMany({
      where: { source: { in: sources }, externalId: { in: externalIds } },
      select: { source: true, externalId: true, status: true, discardedAt: true, leadId: true }
    }),
    db.researchCampaignCandidate.findMany({
      where: { campaignId, candidate: { source: { in: sources }, externalId: { in: externalIds } } },
      select: { candidate: { select: { source: true, externalId: true } } }
    }),
    db.lead.findMany({ where: { osmId: { in: externalIds } }, select: { osmId: true } }),
    db.prospectCandidate.findMany({
      where: { normalizedName: { in: normalizedNames }, OR: [{ latitude: { not: null } }, { website: { not: null } }, { address: { not: null } }] },
      select: { source: true, externalId: true, normalizedName: true, address: true, latitude: true, longitude: true, website: true }
    })
  ]);

  const key = (source: string, externalId: string) => `${source}:${externalId}`;
  const existingByKey = new Map(existingCandidates.map((candidate) => [key(candidate.source, candidate.externalId), candidate]));
  const alreadyLinked = new Set(linkedCandidates.map(({ candidate }) => key(candidate.source, candidate.externalId)));
  const existingLeadIds = new Set(existingLeads.map(({ osmId }) => osmId));

  return businesses.filter((business) => {
    const source = business.source ?? 'Overture';
    const businessKey = key(source, business.osmId);
    const normalizedName = normalizeCandidateName(business.name);
    const existing = existingByKey.get(businessKey);
    if (alreadyLinked.has(businessKey) || existingLeadIds.has(business.osmId)) return false;
    if (sameIdentityCandidates.some((candidate) => candidate.externalId !== business.osmId
      && candidate.normalizedName === normalizedName
      && candidatesRepresentSamePlace(candidate, business))) return false;
    if (!existing) return true;
    return AVAILABLE_CANDIDATE_STATUSES.includes(existing.status as typeof AVAILABLE_CANDIDATE_STATUSES[number])
      && !existing.discardedAt && !existing.leadId;
  });
}

function candidatesRepresentSamePlace(
  candidate: { address: string | null; latitude: number | null; longitude: number | null; website: string | null },
  business: ExternalBusiness
) {
  const sameCoordinates = candidate.latitude !== null && candidate.longitude !== null
    && typeof business.latitude === 'number' && typeof business.longitude === 'number'
    && Math.abs(candidate.latitude - business.latitude) <= 0.0005
    && Math.abs(candidate.longitude - business.longitude) <= 0.0005;
  const sameAddress = Boolean(candidate.address && business.address)
    && normalizeCandidateName(candidate.address ?? '') === normalizeCandidateName(business.address ?? '');
  const sameDomain = Boolean(candidate.website && business.website)
    && websiteDomain(candidate.website ?? '') === websiteDomain(business.website ?? '');
  return sameCoordinates || sameAddress || sameDomain;
}

function websiteDomain(value: string) {
  try { return new URL(value).hostname.toLocaleLowerCase('en-US').replace(/^www\./, ''); }
  catch { return ''; }
}

const EXTRACTOR_VERSION = 'research-provider-enrichment-v1';

export function normalizeCandidateName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function candidateFingerprint(business: Pick<ExternalBusiness, 'name' | 'address' | 'latitude' | 'longitude'>) {
  const name = normalizeCandidateName(business.name);
  const address = normalizeCandidateName(business.address ?? '');
  const coordinates = typeof business.latitude === 'number' && typeof business.longitude === 'number'
    ? `${business.latitude.toFixed(4)},${business.longitude.toFixed(4)}` : 'no-coordinates';
  return `${name}|${address}|${coordinates}`.slice(0, 300);
}

export async function persistCampaignCandidates(
  tx: Prisma.TransactionClient,
  campaignId: string,
  businesses: ExternalBusiness[],
  release: string | null,
  niche: string
) {
  const linkedCandidateIds: string[] = [];

  for (const business of businesses) {
    const source = business.source ?? 'Overture';
    const externalId = business.osmId;
    const normalizedName = normalizeCandidateName(business.name);
    const ambiguous = await hasNearbyIdentityConflict(tx, business, normalizedName, source, externalId);
    const existing = await tx.prospectCandidate.findUnique({ where: { source_externalId: { source, externalId } } });
    const status = ambiguous || existing?.status === 'REVIEW_IDENTITY' ? 'REVIEW_IDENTITY' : existing?.status ?? 'NEW';
    const commercialAnalysis = analyzeProspect({
      niche,
      name: business.name,
      category: business.category ?? null,
      address: business.address ?? null,
      phone: business.phone ?? null,
      website: business.website ?? null,
      instagram: business.instagram ?? null,
      whatsapp: business.whatsapp ?? null,
      latitude: business.latitude ?? null,
      longitude: business.longitude ?? null,
      status
    });
    const analyzedAt = new Date();
    const candidate = await tx.prospectCandidate.upsert({
      where: { source_externalId: { source, externalId } },
      create: {
        source,
        externalId,
        name: business.name.slice(0, 180),
        normalizedName,
        identityFingerprint: candidateFingerprint(business),
        phone: business.phone?.slice(0, 64) ?? null,
        website: business.website?.slice(0, 500) ?? null,
        instagram: business.instagram?.slice(0, 500) ?? null,
        whatsapp: business.whatsapp?.slice(0, 500) ?? null,
        address: business.address?.slice(0, 500) ?? null,
        category: business.category?.slice(0, 160) ?? null,
        latitude: business.latitude ?? null,
        longitude: business.longitude ?? null,
        imageUrl: business.imageUrl?.slice(0, 1000) ?? null,
        status,
        commercialAnalysis,
        analyzedAt
      },
      update: {
        name: business.name.slice(0, 180),
        normalizedName,
        identityFingerprint: candidateFingerprint(business),
        ...(business.phone ? { phone: business.phone.slice(0, 64) } : {}),
        ...(business.website ? { website: business.website.slice(0, 500) } : {}),
        ...(business.instagram ? { instagram: business.instagram.slice(0, 500) } : {}),
        ...(business.whatsapp ? { whatsapp: business.whatsapp.slice(0, 500) } : {}),
        ...(business.address ? { address: business.address.slice(0, 500) } : {}),
        ...(business.category ? { category: business.category.slice(0, 160) } : {}),
        ...(business.latitude != null ? { latitude: business.latitude } : {}),
        ...(business.longitude != null ? { longitude: business.longitude } : {}),
        ...(business.imageUrl ? { imageUrl: business.imageUrl.slice(0, 1000) } : {}),
        status,
        commercialAnalysis,
        analyzedAt
      }
    });

    await tx.researchCampaignCandidate.createMany({
      data: [{ campaignId, candidateId: candidate.id }],
      skipDuplicates: true
    });
    linkedCandidateIds.push(candidate.id);
    await persistEvidence(tx, candidate.id, business, release);
  }

  return linkedCandidateIds;
}

async function hasNearbyIdentityConflict(
  tx: Prisma.TransactionClient,
  business: ExternalBusiness,
  normalizedName: string,
  source: string,
  externalId: string
) {
  if (typeof business.latitude !== 'number' || typeof business.longitude !== 'number') return false;
  const nearby = await tx.prospectCandidate.findMany({
    where: {
      normalizedName,
      NOT: { AND: [{ source }, { externalId }] },
      latitude: { gte: business.latitude - 0.0005, lte: business.latitude + 0.0005 },
      longitude: { gte: business.longitude - 0.0005, lte: business.longitude + 0.0005 }
    },
    select: { address: true, category: true }
  });
  if (!nearby.length) return false;

  const normalize = (value: string | null | undefined) => normalizeCandidateName(value ?? '');
  return nearby.some((candidate) => {
    const addressConflict = Boolean(candidate.address && business.address)
      && normalize(candidate.address) !== normalize(business.address);
    const categoryConflict = Boolean(candidate.category && business.category)
      && normalize(candidate.category) !== normalize(business.category);
    return addressConflict || categoryConflict;
  });
}

async function persistEvidence(
  tx: Prisma.TransactionClient,
  candidateId: string,
  business: ExternalBusiness,
  release: string | null
) {
  const provider = business.source ?? 'Overture';
  const fields: Array<{ field: string; value: string | null; source: string; sourceUrl: string; verified: boolean }> = [
    { field: 'name', value: business.name, source: provider, sourceUrl: '', verified: false },
    { field: 'category', value: business.category ?? null, source: provider, sourceUrl: '', verified: false },
    { field: 'address', value: business.address ?? null, source: provider, sourceUrl: '', verified: false },
    { field: 'phone', value: business.phone ?? null, source: business.phoneSource ? 'OFFICIAL_SITE' : provider, sourceUrl: business.website ?? '', verified: Boolean(business.phoneSource) },
    { field: 'website', value: business.website, source: provider, sourceUrl: '', verified: false },
    { field: 'instagram', value: business.instagram, source: provider, sourceUrl: business.website ?? '', verified: false },
    { field: 'whatsapp', value: business.whatsapp ?? null, source: business.whatsappSourceUrl ? 'OFFICIAL_SITE' : provider, sourceUrl: business.whatsappSourceUrl ?? business.website ?? '', verified: Boolean(business.whatsappSourceUrl) },
    { field: 'imageUrl', value: business.imageUrl ?? null, source: provider, sourceUrl: '', verified: false },
    { field: 'googleMapsUrl', value: business.googleMapsUrl ?? null, source: provider, sourceUrl: business.googleMapsUrl ?? '', verified: false }
  ];

  for (const item of fields) {
    if (!item.value) continue;
    const sourceUrl = item.sourceUrl.slice(0, 1000);
    await tx.researchEvidence.upsert({
      where: { candidateId_field_source_sourceUrl: { candidateId, field: item.field, source: item.source, sourceUrl } },
      create: { candidateId, field: item.field, value: item.value.slice(0, 1000), source: item.source, sourceUrl, release, verified: item.verified, extractorVersion: EXTRACTOR_VERSION },
      update: { value: item.value.slice(0, 1000), release, verified: item.verified, extractorVersion: EXTRACTOR_VERSION, capturedAt: new Date() }
    });
  }
}
