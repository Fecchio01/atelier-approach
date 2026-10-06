import { prisma } from './db';
import { isValidFollowUpDelay } from './follow-up-scheduling';

type SettingsDatabase = {
  crmSettings: { findUnique(args: { where: { id: string }; select: { followUpDelayDays: true } }): Promise<{ followUpDelayDays: number } | null> };
};

export async function getFollowUpDelayDays(database: SettingsDatabase = prisma): Promise<number> {
  const settings = await database.crmSettings.findUnique({ where: { id: 'team' }, select: { followUpDelayDays: true } });
  return isValidFollowUpDelay(settings?.followUpDelayDays) ? settings.followUpDelayDays : 2;
}
