'use client';

import { useState } from 'react';
import { CircleNotchIcon, MapPinIcon, PlusIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';
import { AUTONOMOUS_PROSPECTING_NICHE_SUGGESTIONS } from '@/lib/research/autonomous';

export function AutonomousProspectingSettings({ initialEnabled, initialDailyLimit, initialTime, initialNiches }: { initialEnabled: boolean; initialDailyLimit: number; initialTime: string; initialNiches: string[] }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [dailyLimit, setDailyLimit] = useState(initialDailyLimit);
  const [time, setTime] = useState(initialTime);
  const [customNicheMode, setCustomNicheMode] = useState(initialNiches.length > 0);
  const [niches, setNiches] = useState(initialNiches);
  const [nicheDraft, setNicheDraft] = useState('');
  const [nicheFeedback, setNicheFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  function addNiche(value = nicheDraft) {
    const niche = value.trim().replace(/\s+/g, ' ');
    if (niche.length < 2 || niche.length > 80) {
      setNicheFeedback('O nicho precisa ter entre 2 e 80 caracteres.');
      return;
    }
    if (niches.some((existing) => normalizeNiche(existing) === normalizeNiche(niche))) {
      setNicheFeedback('Esse nicho já está na lista. A comparação ignora acentos e diferenças entre maiúsculas e minúsculas.');
      return;
    }
    if (niches.length >= 10) {
      setNicheFeedback('Você já adicionou o limite de 10 nichos.');
      return;
    }
    setNiches((current) => [...current, niche]);
    setNicheDraft('');
    setCustomNicheMode(true);
    setNicheFeedback('');
    setError('');
  }

  async function save() {
    setBusy(true); setNotice(''); setError('');
    if (customNicheMode && niches.length === 0) {
      setError('Adicione ao menos um nicho ou escolha a rotação automática.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/agents/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospectingEnabled: enabled, prospectingDailyLimit: dailyLimit, prospectingTime: time, prospectingNiches: customNicheMode ? niches : [] })
      });
      const data = await response.json() as { error?: string; settings?: { prospectingEnabled: boolean; prospectingDailyLimit: number; prospectingTime: string; prospectingNiches: string[] } };
      if (!response.ok || !data.settings) throw new Error(data.error ?? 'Não foi possível salvar a automação.');
      setEnabled(data.settings.prospectingEnabled);
      setDailyLimit(data.settings.prospectingDailyLimit);
      setTime(data.settings.prospectingTime);
      setNiches(data.settings.prospectingNiches);
      setCustomNicheMode(data.settings.prospectingNiches.length > 0);
      setNotice('Configurações salvas para toda a equipe.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-5">
    <section className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><SparkleIcon size={21} weight="fill" /></span>
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--atelier-green)]">Agente autônomo</p><h2 className="mt-1 text-xl font-semibold">Pesquisa diária de empresas</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Defina quando e em quais segmentos o agente deve pesquisar. Ele analisa as candidatas todos os dias sem iniciar uma campanha manualmente nem escolher uma região.</p></div>
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

      <fieldset className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold">Nichos da pesquisa</legend>
        <p className="mb-4 text-xs leading-5 text-white/50">Esta preferência é compartilhada com toda a equipe. A cidade continua rodando automaticamente.</p>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modo de escolha dos nichos">
          <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${!customNicheMode ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.07]' : 'border-white/10 bg-white/[0.02]'}`}>
            <input type="radio" name="niche-mode" checked={!customNicheMode} onChange={() => { setCustomNicheMode(false); setError(''); }} className="size-4 accent-[var(--atelier-green)]" />
            <span><span className="block font-medium">Sorteio automático</span><span className="mt-0.5 block text-xs text-white/45">O agente sorteia entre os nichos disponíveis.</span></span>
          </label>
          <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${customNicheMode ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.07]' : 'border-white/10 bg-white/[0.02]'}`}>
            <input type="radio" name="niche-mode" checked={customNicheMode} onChange={() => { setCustomNicheMode(true); setError(''); }} className="size-4 accent-[var(--atelier-green)]" />
            <span><span className="block font-medium">Escolher meus nichos</span><span className="mt-0.5 block text-xs text-white/45">Selecione um ou vários; ele alterna um por dia.</span></span>
          </label>
        </div>

        {customNicheMode ? <div className="mt-4 grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium text-white/70" htmlFor="prospecting-niche-input">Adicionar nicho (até 10)
              <input id="prospecting-niche-input" value={nicheDraft} maxLength={80} onChange={(event) => setNicheDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNiche(); } }} placeholder="Ex.: estúdios de pilates" className="min-h-11 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--atelier-green)]" />
            </label>
            <button type="button" onClick={() => addNiche()} disabled={nicheDraft.trim().length < 2 || niches.length >= 10} className="mt-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-medium text-white/80 transition-colors hover:border-[var(--atelier-green)] hover:text-[var(--atelier-green)] disabled:cursor-not-allowed disabled:opacity-40"><PlusIcon size={16} />Adicionar</button>
          </div>
          {nicheFeedback ? <p role="status" className="text-sm text-amber-100">{nicheFeedback}</p> : null}

          {niches.length ? <ul aria-label="Nichos escolhidos" className="flex flex-wrap gap-2">{niches.map((niche) => <li key={normalizeNiche(niche)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--atelier-green)]/35 bg-[var(--atelier-green)]/[0.08] py-1 pl-3 pr-1.5 text-sm text-white/85">
            <span>{niche}</span><button type="button" onClick={() => setNiches((current) => current.filter((item) => normalizeNiche(item) !== normalizeNiche(niche)))} aria-label={`Remover nicho ${niche}`} className="grid size-11 shrink-0 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]"><XIcon size={15} /></button>
          </li>)}</ul> : <p className="text-sm text-white/45">Adicione pelo menos um nicho para a rotação personalizada.</p>}

          <div>
            <p className="mb-2 text-xs font-medium text-white/50">Sugestões</p>
            <div className="flex flex-wrap gap-2">{AUTONOMOUS_PROSPECTING_NICHE_SUGGESTIONS.filter((suggestion) => !niches.some((niche) => normalizeNiche(niche) === normalizeNiche(suggestion))).map((suggestion) => <button key={suggestion} type="button" onClick={() => addNiche(suggestion)} disabled={niches.length >= 10} className="min-h-11 rounded-full border border-white/10 px-3 text-xs text-white/65 transition-colors hover:border-[var(--atelier-green)]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">+ {suggestion}</button>)}</div>
          </div>
          <p className="text-xs leading-5 text-white/45">Nichos personalizados são comparados com nomes e categorias publicados pela fonte. A cobertura pode variar conforme o termo usado. Com vários nichos, o agente alterna um por dia e continua rotacionando as cidades.</p>
        </div> : null}
      </fieldset>

      <div className="mt-4 grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-2">
        <p className="flex items-start gap-2 text-xs leading-5 text-white/50"><MapPinIcon size={16} className="mt-0.5 shrink-0 text-[var(--atelier-green)]" /> O nicho segue o modo escolhido acima e as cidades continuam em rotação automática pelo Brasil.</p>
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

function normalizeNiche(niche: string) {
  return niche.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
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
