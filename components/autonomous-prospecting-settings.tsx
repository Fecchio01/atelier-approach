'use client';

import { useState } from 'react';
import { CircleNotchIcon, MapPinIcon, SparkleIcon } from '@phosphor-icons/react';

export function AutonomousProspectingSettings({ initialEnabled, initialDailyLimit, initialTime }: { initialEnabled: boolean; initialDailyLimit: number; initialTime: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [dailyLimit, setDailyLimit] = useState(initialDailyLimit);
  const [time, setTime] = useState(initialTime);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/agents/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospectingEnabled: enabled, prospectingDailyLimit: dailyLimit, prospectingTime: time })
      });
      const data = await response.json() as { error?: string; settings?: { prospectingEnabled: boolean; prospectingDailyLimit: number; prospectingTime: string } };
      if (!response.ok || !data.settings) throw new Error(data.error ?? 'Não foi possível salvar a automação.');
      setEnabled(data.settings.prospectingEnabled);
      setDailyLimit(data.settings.prospectingDailyLimit);
      setTime(data.settings.prospectingTime);
      setNotice('Configurações salvas para toda a equipe.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-5">
    <section className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><SparkleIcon size={21} weight="fill" /></span>
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--atelier-green)]">Agente autônomo</p><h2 className="mt-1 text-xl font-semibold">Pesquisa diária de empresas</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">O agente escolhe o nicho e a capital por uma rotação automática, pesquisa e analisa as candidatas todos os dias. Não precisa iniciar uma campanha nem escolher uma região.</p></div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
          <span><span className="block text-sm font-medium">Executar pesquisa diária</span><span className="mt-1 block text-xs text-white/45">Configuração compartilhada com a equipe</span></span>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-[var(--atelier-green)]" />
        </label>
        <label className="grid gap-2 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-medium">Máximo de candidatas por dia
          <select value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} className="min-h-11 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-3 text-white outline-none focus:border-[var(--atelier-green)]">
            {[5, 10, 15, 20].map((limit) => <option key={limit} value={limit}>{limit} empresas</option>)}
          </select>
        </label>
        <label className="grid gap-2 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-medium" htmlFor="prospecting-time">Horário diário (Brasília)
          <input id="prospecting-time" type="time" step={3600} value={time} onChange={(event) => setTime(event.target.value)} className="min-h-11 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-3 text-white outline-none focus:border-[var(--atelier-green)]" />
        </label>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-2">
        <p className="flex items-start gap-2 text-xs leading-5 text-white/50"><MapPinIcon size={16} className="mt-0.5 shrink-0 text-[var(--atelier-green)]" /> Niche e capital são escolhidos pela rotação do agente para distribuir a cobertura pelo Brasil.</p>
        <p className="flex items-start gap-2 text-xs leading-5 text-white/50"><SparkleIcon size={15} className="mt-0.5 shrink-0 text-[var(--atelier-green)]" /> A análise usa dados e evidências da pesquisa sem chamadas a modelos pagos. Não contata empresas nem altera o funil.</p>
      </div>
      <p className="mt-3 text-xs text-white/45">Próxima janela prevista: {getNextRunLabel(time)}. Horário compartilhado com toda a equipe, em Brasília.</p>
      <p className="mt-1 text-xs text-white/40">Na faixa gratuita, a Vercel pode executar em qualquer momento dentro da hora escolhida (variação de até 59 minutos). Se alterar o horário depois que a janela de hoje passar, a mudança vale a partir de amanhã.</p>
      {notice ? <p role="status" className="mt-4 text-sm text-[var(--atelier-green)]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-200">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={busy} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-5 text-sm font-semibold text-[#101507] transition-colors hover:bg-[var(--atelier-green-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] disabled:opacity-50">
        {busy ? <CircleNotchIcon size={16} className="animate-spin" /> : null}{busy ? 'Salvando…' : 'Salvar automação'}
      </button>
    </section>
  </div>;
}

function getNextRunLabel(time: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const next = new Date(`${today}T12:00:00-03:00`);
  if (Number(part('hour')) >= Number(time.slice(0, 2))) next.setUTCDate(next.getUTCDate() + 1);
  return `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }).format(next)} às ${time}`;
}
