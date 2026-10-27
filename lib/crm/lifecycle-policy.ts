import { getFollowUpDueAt } from '../lead-lifecycle';

export const automaticFollowUpRules = [
  { stage: 'CONTACTED', delayDays: 2 },
  { stage: 'PROPOSAL', delayDays: 5 }
] as const;

export function getLifecycleReferenceAt(stageEnteredAt: Date, lastMeaningfulInteractionAt: Date | null): Date {
  if (!Number.isFinite(stageEnteredAt.valueOf()) || (lastMeaningfulInteractionAt && !Number.isFinite(lastMeaningfulInteractionAt.valueOf()))) {
    throw new RangeError('A data de referência do ciclo de vida deve ser válida.');
  }
  if (!lastMeaningfulInteractionAt || lastMeaningfulInteractionAt <= stageEnteredAt) return stageEnteredAt;
  return lastMeaningfulInteractionAt;
}

export function isProtectedFromAutomaticDiscard(input: {
  stage: string;
  meetingAt: Date | null;
  postFollowUpAt: Date | null;
  lastMeaningfulInteractionAt: Date | null;
  now: Date;
}): boolean {
  if (!Number.isFinite(input.now.valueOf())) throw new RangeError('A data atual deve ser válida.');
  if (input.stage === 'PROPOSAL' || input.stage === 'MEETING') return true;
  if (input.meetingAt && input.meetingAt > input.now) return true;
  return Boolean(
    input.postFollowUpAt &&
    input.lastMeaningfulInteractionAt &&
    input.lastMeaningfulInteractionAt >= input.postFollowUpAt
  );
}

export function hasInteractionSincePostFollowUp(input: {
  postFollowUpAt: Date | null;
  lastMeaningfulInteractionAt: Date | null;
}): boolean {
  return Boolean(
    input.postFollowUpAt &&
    input.lastMeaningfulInteractionAt &&
    input.lastMeaningfulInteractionAt >= input.postFollowUpAt
  );
}

export function isAutomaticFollowUpDue(input: {
  stage: string;
  stageEnteredAt: Date;
  lastMeaningfulInteractionAt: Date | null;
  postFollowUpAt: Date | null;
  delayDays: number;
  now: Date;
}): boolean {
  if (input.stage !== 'CONTACTED' && input.stage !== 'PROPOSAL') return false;
  if (input.postFollowUpAt || !Number.isFinite(input.now.valueOf())) return false;
  const referenceAt = getLifecycleReferenceAt(input.stageEnteredAt, input.lastMeaningfulInteractionAt);
  return getFollowUpDueAt(referenceAt, input.delayDays) <= input.now;
}
