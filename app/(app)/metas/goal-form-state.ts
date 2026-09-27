export type GoalActionState = { status: 'idle' | 'saved' | 'error'; message: string };
export const initialGoalActionState: GoalActionState = { status: 'idle', message: '' };
