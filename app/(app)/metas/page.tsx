import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { upsertWeeklyGoal } from '@/lib/metrics';
import { PageHeading, Surface } from '@/components/ui';

function currentWeekStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

async function saveGoal(formData: FormData) {
  'use server';
  const user = await getCurrentUser();
  if (!user) return;
  const approachesTarget = Number(formData.get('approachesTarget'));
  const interestsTarget = Number(formData.get('interestsTarget'));
  const meetingsTarget = Number(formData.get('meetingsTarget'));
  const salesTarget = Number(formData.get('salesTarget'));
  const revenueTarget = Number(formData.get('revenueTarget'));
  if (![approachesTarget, interestsTarget, meetingsTarget, salesTarget].every((value) => Number.isInteger(value) && value >= 0) || !Number.isFinite(revenueTarget) || revenueTarget < 0) return;
  await upsertWeeklyGoal({ ownerId: formData.get('scope') === 'team' ? null : user.id, weekStart: currentWeekStart(), approachesTarget, interestsTarget, meetingsTarget, salesTarget, revenueTarget });
  revalidatePath('/'); revalidatePath('/metas');
}

export default async function GoalsPage() {
  const weekStart = currentWeekStart();
  const [user, goals] = await Promise.all([
    getCurrentUser(),
    prisma.goal.findMany({ where: { weekStart } })
  ]);
  const teamGoal = goals.find((goal) => goal.ownerId === '__team__');
  const personalGoal = user ? goals.find((goal) => goal.ownerId === user.id) : undefined;
  const GoalForm = ({ scope, goal, title }: { scope: 'team' | 'personal'; goal: typeof teamGoal; title: string }) => <Surface><form action={saveGoal} className="grid gap-5 p-6"><input type="hidden" name="scope" value={scope} /><h2 className="text-xl font-semibold">{title}</h2><label className="grid gap-2 text-sm">Meta de abordagens<input name="approachesTarget" type="number" min="0" defaultValue={goal?.approachesTarget ?? 0} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><label className="grid gap-2 text-sm">Meta de interesses<input name="interestsTarget" type="number" min="0" defaultValue={goal?.interestsTarget ?? 0} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><label className="grid gap-2 text-sm">Meta de reuniões / retornos<input name="meetingsTarget" type="number" min="0" defaultValue={goal?.meetingsTarget ?? 0} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><label className="grid gap-2 text-sm">Meta de vendas<input name="salesTarget" type="number" min="0" defaultValue={goal?.salesTarget ?? 0} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><label className="grid gap-2 text-sm">Meta de receita (R$)<input name="revenueTarget" type="number" min="0" step="0.01" defaultValue={goal?.revenueTarget ?? 0} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><button className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-4 py-2 font-semibold text-black">Salvar meta {scope === 'team' ? 'da equipe' : 'pessoal'}</button></form></Surface>;
  return <section className="mx-auto max-w-3xl px-5 py-12 md:px-8"><PageHeading eyebrow="Planejamento semanal" title="Metas semanais" description="Edite metas de equipe e pessoais em formulários separados, sem misturar seus valores." action={<Link className="text-sm text-[var(--atelier-green)]" href="/">← Painel</Link>} /><div className="mt-8 grid gap-6"><GoalForm scope="team" goal={teamGoal} title="Meta da equipe" /><GoalForm scope="personal" goal={personalGoal} title="Minha meta" /></div></section>;
}
