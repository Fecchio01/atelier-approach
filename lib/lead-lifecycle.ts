const millisecondsPerDay = 24 * 60 * 60 * 1000;
const postFollowUpDiscardDays = 5;
const discardedRetentionDays = 7;

export type LifecycleProcessingResult = {
  movedToFollowUp: number;
  discardedForInactivity: number;
  permanentlyDeleted: number;
};

export function getFollowUpDueAt(stageEnteredAt: Date, delayDays: number): Date {
  const enteredAtMs = stageEnteredAt.valueOf();
  if (!Number.isFinite(enteredAtMs) || !Number.isInteger(delayDays) || delayDays <= 0) {
    throw new RangeError('A data de entrada e o intervalo do follow-up devem ser válidos.');
  }

  const dueAt = new Date(enteredAtMs + delayDays * millisecondsPerDay);
  if (!Number.isFinite(dueAt.valueOf())) {
    throw new RangeError('A data calculada do follow-up está fora do intervalo válido.');
  }
  return dueAt;
}

export function getPostFollowUpDiscardAt(completedAt: Date): Date {
  const completedAtMs = completedAt.valueOf();
  if (!Number.isFinite(completedAtMs)) {
    throw new RangeError('A data de conclusão do follow-up deve ser válida.');
  }

  const discardAt = new Date(completedAtMs + postFollowUpDiscardDays * millisecondsPerDay);
  if (!Number.isFinite(discardAt.valueOf())) {
    throw new RangeError('A data calculada para descarte está fora do intervalo válido.');
  }
  return discardAt;
}

export function isPurgeEligible(discardedAt: Date | null, now: Date): boolean {
  if (discardedAt === null || !Number.isFinite(discardedAt.valueOf()) || !Number.isFinite(now.valueOf())) {
    return false;
  }
  return now.valueOf() - discardedAt.valueOf() >= discardedRetentionDays * millisecondsPerDay;
}

export function getLeadLifecycleWarning(
  leadId: string,
  postFollowUpAt: Date,
  now: Date
): { leadId: string; discardAt: Date; daysRemaining: number } | null {
  const postFollowUpAtMs = postFollowUpAt.valueOf();
  const nowMs = now.valueOf();
  if (!Number.isFinite(postFollowUpAtMs) || !Number.isFinite(nowMs)) {
    throw new RangeError('As datas do alerta de ciclo de vida devem ser válidas.');
  }

  const discardAt = getPostFollowUpDiscardAt(postFollowUpAt);
  const remainingMs = discardAt.valueOf() - nowMs;
  if (remainingMs > millisecondsPerDay) return null;

  return {
    leadId,
    discardAt,
    daysRemaining: Math.ceil(remainingMs / millisecondsPerDay)
  };
}
