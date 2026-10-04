import { prisma } from './db';

type SettingsDatabase = {
  crmSettings: { findUnique(args: { where: { id: string }; select: { followUpDelayDays: true } }): Promise<{ followUpDelayDays: number } | null> };
};

export async function getFollowUpDelayDays(database: SettingsDatabase = prisma): Promise<number> {
  const settings = await database.crmSettings.findUnique({ where: { id: 'team' }, select: { followUpDelayDays: true } });
  return settings?.followUpDelayDays ?? 2;
}
