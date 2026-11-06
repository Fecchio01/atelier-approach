import { ProspectFeedbackOutcome, ProspectFeedbackReason, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const MIN_CATEGORY_SIGNALS = 3;
const MAX_FIT_ADJUSTMENT = 8;

export const feedbackReasonLabels: Record<ProspectFeedbackReason, string> = {
  DUPLICATE: 'Duplicada',
  WRONG_NICHE: 'Nicho incorreto',
  INVALID_BUSINESS: 'Empresa inválida',
  INSUFFICIENT_DATA: 'Dados insuficientes',
  OTHER: 'Outro motivo'
};

export function normalizeFeedbackCategory(category: string | null | undefined) {
  return category?.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') || null;
}

/** Stores the current team decision for one candidate; later decisions replace it. */
export async function saveCandidateFeedback(
  tx: Prisma.TransactionClient,
  input: {
    candidateId: string;
    outcome: ProspectFeedbackOutcome;
    reason?: ProspectFeedbackReason | null;
    category?: string | null;
    updatedById?: string | null;
  }
) {
  return tx.prospectCandidateFeedback.upsert({
    where: { candidateId: input.candidateId },
    create: {
      candidateId: input.candidateId,
      outcome: input.outcome,
      reason: input.reason ?? null,
      category: normalizeFeedbackCategory(input.category),
      updatedById: input.updatedById ?? null
    },
    update: {
      outcome: input.outcome,
      reason: input.reason ?? null,
      category: normalizeFeedbackCategory(input.category),
      updatedById: input.updatedById ?? null
    }
  });
}

export type CategoryCalibration = {
  signals: number;
  accepted: number;
  wrongNiche: number;
  fitAdjustment: number;
  label: string | null;
};

/** Conservative team heuristic for textual fit only; never represents conversion likelihood. */
export async function getCategoryCalibration(category: string | null | undefined): Promise<CategoryCalibration> {
  const normalizedCategory = normalizeFeedbackCategory(category);
  if (!normalizedCategory) return { signals: 0, accepted: 0, wrongNiche: 0, fitAdjustment: 0, label: null };

  const [accepted, wrongNiche, signals] = await Promise.all([
    prisma.prospectCandidateFeedback.count({ where: { category: normalizedCategory, outcome: 'ACCEPTED' } }),
    prisma.prospectCandidateFeedback.count({ where: { category: normalizedCategory, outcome: 'DISCARDED', reason: 'WRONG_NICHE' } }),
    prisma.prospectCandidateFeedback.count({ where: { category: normalizedCategory } })
  ]);

  if (signals < MIN_CATEGORY_SIGNALS) return { signals, accepted, wrongNiche, fitAdjustment: 0, label: null };

  // Duplicate/invalid/data-quality feedback is intentionally excluded from niche-fit calibration.
  const fitAdjustment = Math.max(-MAX_FIT_ADJUSTMENT, Math.min(MAX_FIT_ADJUSTMENT, accepted * 2 - wrongNiche * 3));
  if (!fitAdjustment) return { signals, accepted, wrongNiche, fitAdjustment, label: `Calibração da equipe: ${signals} decisões nesta categoria; sem ajuste de aderência.` };

  const direction = fitAdjustment > 0 ? 'aumenta' : 'reduz';
  return {
    signals,
    accepted,
    wrongNiche,
    fitAdjustment,
    label: `Calibração da equipe ${direction} a aderência textual em ${Math.abs(fitAdjustment)} pontos (${accepted} aceitas, ${wrongNiche} marcadas como nicho incorreto).`
  };
}
