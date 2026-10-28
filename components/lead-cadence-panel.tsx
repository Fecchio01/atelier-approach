'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDotsIcon, CircleNotchIcon, PauseIcon, PlayIcon, StopIcon } from '@phosphor-icons/react';

type Enrollment = { id: string; status: string; attempt: number; nextDueAt: string; pauseReason: string | null; policyVersion: string };
const statusLabels: Record<string, string> = { ACTIVE: 'Agendada', WAITING_HUMAN: 'Aguardando ação humana', PAUSED: 'Pausada', COMPLETED: 'Concluída', CANCELLED: 'Encerrada' };

export function LeadCadencePanel({ leadId }: { leadId: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/cadence`, { cache: 'no-store' });
      if (response.ok) setEnrollment((await response.json() as { enrollment: Enrollment | null }).enrollment);
    } catch { setNotice('Não foi possível carregar a cadência.'); }
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: 'START' | 'PAUSE' | 'RESUME' | 'CANCEL') {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/cadence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json() as { enrollment?: Enrollment; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível atualizar a cadência.');
      setEnrollment(data.enrollment ?? null);
      setNotice(action === 'START' || action === 'RESUME' ? 'Cadência ativada. Ela criará apenas tarefas para revisão da equipe; não envia mensagens.' : action === 'PAUSE' ? 'Cadência pausada.' : 'Cadência encerrada.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao atualizar.'); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
    <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><CalendarDotsIcon size={18} /></span><div><h3 className="text-sm font-semibold">Cadência assistida de follow-up</h3><p className="mt-1 text-xs leading-5 text-white/50">Após sua ativação, cria uma tarefa em 2 dias úteis e, se você concluir a primeira ação, uma segunda 3 dias úteis depois. Nenhuma mensagem é enviada automaticamente.</p></div></div>
    {enrollment && <div className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm"><p className="font-medium">{statusLabels[enrollment.status] ?? enrollment.status} · {enrollment.attempt}/2 ações</p>{enrollment.status === 'ACTIVE' && <p className="mt-1 text-xs text-white/45">Próxima tarefa: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(enrollment.nextDueAt))}</p>}{enrollment.pauseReason && <p className="mt-1 text-xs text-amber-100/65">{enrollment.pauseReason}</p>}</div>}
    {notice && <p role="status" className="text-xs text-white/65">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      {(!enrollment || ['COMPLETED', 'CANCELLED'].includes(enrollment.status)) && <button type="button" disabled={busy} onClick={() => void act('START')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--atelier-green)]/40 px-3 text-sm text-[var(--atelier-green)] disabled:opacity-50">{busy ? <CircleNotchIcon className="animate-spin" size={15} /> : <PlayIcon size={15} />} Ativar cadência</button>}
      {enrollment?.status === 'PAUSED' && <button type="button" disabled={busy} onClick={() => void act('RESUME')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--atelier-green)]/40 px-3 text-sm text-[var(--atelier-green)] disabled:opacity-50"><PlayIcon size={15} /> Retomar</button>}
      {enrollment && ['ACTIVE', 'WAITING_HUMAN'].includes(enrollment.status) && <button type="button" disabled={busy} onClick={() => void act('PAUSE')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/70 disabled:opacity-50"><PauseIcon size={15} /> Pausar</button>}
      {enrollment && !['COMPLETED', 'CANCELLED'].includes(enrollment.status) && <button type="button" disabled={busy} onClick={() => void act('CANCEL')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/70 disabled:opacity-50"><StopIcon size={15} /> Encerrar</button>}
    </div>
  </section>;
}
