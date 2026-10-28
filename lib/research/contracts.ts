import { z } from 'zod';

export const createResearchCampaignSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(128),
  name: z.string().trim().min(2).max(120).optional(),
  niche: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100).optional(),
  maxCandidates: z.number().int().min(1).max(20).default(20),
  maxAreas: z.number().int().min(1).max(20).default(12),
  phoneOnly: z.boolean().default(false),
  digitalPresence: z.boolean().default(false)
}).strict();

export type CreateResearchCampaignInput = z.infer<typeof createResearchCampaignSchema>;
