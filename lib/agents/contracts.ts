import { z } from 'zod';

export const createAgentRunSchema = z.object({ leadId: z.string().trim().min(1).max(128) }).strict();

export const leadAnalysisSchema = z.object({
  engine: z.enum(['RULES', 'GEMINI']).default('RULES'),
  model: z.string().max(80).nullable().default(null),
  usage: z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable() }).strict().nullable().default(null),
  summary: z.string().min(1).max(500),
  dataCoverage: z.number().int().min(0).max(100),
  knownFacts: z.array(z.string().min(1).max(180)).max(8),
  unknowns: z.array(z.string().min(1).max(180)).max(8),
  recommendation: z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(600),
    dueDate: z.string().datetime(),
    taskType: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'MEETING_PREP', 'OTHER']),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH'])
  }).strict(),
  commercialAnalysis: z.object({
    version: z.string().min(1),
    fit: z.enum(['POTENTIAL_MATCH', 'NO_MATCH', 'NO_CATALOG', 'INSUFFICIENT_DATA']),
    dataQuality: z.enum(['LIMITED', 'PARTIAL', 'GOOD']),
    knownFacts: z.array(z.object({ label: z.string(), value: z.string(), evidenceId: z.string() }).strict()).max(12),
    unknowns: z.array(z.string()).max(12),
    serviceSuggestions: z.array(z.object({ serviceId: z.string(), serviceName: z.string(), reason: z.string() }).strict()).max(5)
  }).strict().optional(),
  strategy: z.object({
    version: z.string().min(1),
    nextStep: z.string().min(1),
    reason: z.string().min(1),
    requiresHumanReview: z.literal(true)
  }).strict().optional()
}).strict();

const approvalHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const agentDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), approvalHash: approvalHashSchema }).strict(),
  z.object({ decision: z.literal('REJECT'), approvalHash: approvalHashSchema }).strict(),
  z.object({
    decision: z.literal('EDIT'),
    approvalHash: approvalHashSchema,
    edits: z.object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().min(3).max(600).optional(),
      dueDate: z.string().datetime().optional()
    }).strict().refine((edits) => Object.keys(edits).length > 0)
  }).strict()
]);

export type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
