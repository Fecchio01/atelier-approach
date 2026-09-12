import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { upsertWeeklyGoal } from '@/lib/metrics';

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
  const revenueTarget = Number(formData.get('revenueTarget'));
  if (!Number.isInteger(approachesTarget) || approachesTarget < 0 || !Number.isFinite(revenueTarget) || revenueTarget < 0) return;
  await upsertWeeklyGoal({ ownerId: formData.get('scope') === 'team' ? null : user.id, weekStart: currentWeekStart(), approachesTarget, revenueTarget });
  revalidatePath('/'); revalidatePath('/metas');
}

export default async function GoalsPage() {
  const user = await getCurrentUser(); const weekStart = currentWeekStart();
  const goals = await prisma.goal.findMany({ where: { weekStart } });
  const teamGoal = goals.find((goal) => goal.ownerId === '__team__');
  const personalGoal = user ? goals.find((goal) => goal.ownerId === user.id) : undefined;
  const GoalForm = ({ scope, goal, title }: { scope: 'team' | 'personal'; goal: typeof teamGoal; title: string }) => <form action={saveGoal} className="grid gap-5 rounded-2xl border border-white/15 bg-white/5 p-6"><input type="hidden" name="scope" value={scope} /><h2 className="text-xl font-semibold">{title}</h2><label className="grid gap-2 text-sm">Meta de abordagens<input name="approachesTarget" type="number" min="0" defaultValue={goal?.approachesTarget ?? 0} className="rounded-md border border-white/20 bg-black px-3 py-2" /></label><label className="grid gap-2 text-sm">Meta de receita (R$)<input name="revenueTarget" type="number" min="0" step="0.01" defaultValue={goal?.revenueTarget ?? 0} className="rounded-md border border-white/20 bg-black px-3 py-2" /></label><button className="rounded-md bg-[var(--atelier-green)] px-4 py-2 font-semibold text-black">Salvar meta {scope === 'team' ? 'da equipe' : 'pessoal'}</button></form>;
  return <section className="mx-auto max-w-3xl px-5 py-12 md:px-8"><Link className="text-sm text-[var(--atelier-green)]" href="/">← Dashboard</Link><p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Planejamento semanal</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Metas semanais</h1><p className="mt-2 text-white/65">Edite metas de equipe e pessoais em formulários separados, sem misturar seus valores.</p><div className="mt-8 grid gap-6"><GoalForm scope="team" goal={teamGoal} title="Meta da equipe" /><GoalForm scope="personal" goal={personalGoal} title="Minha meta" /></div></section>;
}
