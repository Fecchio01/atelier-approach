'use client';

import { useState } from 'react';
import { CircleNotchIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';

export function AgentAutomationControl({ initiallyPaused, activeCadences, waitingTasks }: { initiallyPaused: boolean; activeCadences: number; waitingTasks: number }) {
  const [paused, setPaused] = useState(initiallyPaused);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function toggle() {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/agents/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: !paused }) });
      const data = await response.json() as { error?: string; settings?: { paused: boolean } };
      if (!response.ok || !data.settings) throw new Error(data.error ?? 'Não foi possível atualizar a pausa.');
      setPaused(data.settings.paused); setNotice(data.settings.paused ? 'Automações pausadas. Tarefas humanas já criadas continuam na fila.' : 'Automações retomadas. Nenhum envio externo será iniciado sem provedor configurado.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao alterar pausa.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 grid gap-4 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:flex sm:items-center sm:justify-between sm:p-5">
    <div><p className="font-semibold">Controle da equipe · {paused ? 'pausado' : 'ativo'}</p><p className="mt-1 text-sm text-white/50">{activeCadences} cadências ativas · {waitingTasks} tarefas aguardando a equipe. Pausar interrompe a criação de novas tarefas de cadência.</p>{notice && <p role="status" className="mt-2 text-xs text-white/60">{notice}</p>}</div>
    <button type="button" disabled={busy} onClick={() => void toggle()} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${paused ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/15 text-white/75'}`}>{busy ? <CircleNotchIcon size={16} className="animate-spin" /> : paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}{paused ? 'Retomar automações' : 'Pausar automações'}</button>
  </section>;
}
