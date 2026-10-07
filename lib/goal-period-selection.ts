export type GoalPeriodSelection = 'WEEKLY' | 'MONTHLY';

const storageKey = 'arvello.goal-period-selection';

type GoalPeriodStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readGoalPeriodSelection(storage: Pick<Storage, 'getItem'>): GoalPeriodSelection {
  return storage.getItem(storageKey) === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY';
}

export function writeGoalPeriodSelection(storage: GoalPeriodStorage, selection: GoalPeriodSelection): void {
  storage.setItem(storageKey, selection);
}
