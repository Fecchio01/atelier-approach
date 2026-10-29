'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChatCircleDotsIcon, CircleNotchIcon, PaperPlaneTiltIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';

type ChatSources = {
  preparedAt: string;
  researchDate: string;
  scheduledTime: string;
  researchAvailable: boolean;
  researchStatus: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  researchCandidates: number;
  reportFrom: string | null;
  reportTo: string | null;
  reportAvailable: boolean;
  engine: 'GEMINI' | 'LOCAL';
};

type Message = { id: string; role: 'user' | 'assistant'; text: string; sources?: ChatSources };

const quickQuestions = [
  'A pesquisa de hoje já rodou?',
  'Resume nosso relatório semanal.',
  'O que merece atenção no CRM?',
  'Me dê uma dica de abordagem.'
];

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (window.matchMedia('(min-width: 640px)').matches) inputRef.current?.focus();
      else titleRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, loading]);

  function closeChat() {
    sessionRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
    setError('');
    setDraft('');
    setMessages([]);
    setOpen(false);
  }

  async function sendMessage(text: string) {
    const message = text.trim().slice(0, 500);
    if (message.length < 2 || loading) return;
    const session = sessionRef.current;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);
    setDraft('');
    setError('');
    setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal
      });
      const payload = await response.json() as { reply?: string; sources?: ChatSources; error?: string };
      if (!response.ok || !payload.reply || !payload.sources) throw new Error(payload.error ?? 'Não foi possível consultar o agente.');
      if (session !== sessionRef.current) return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: payload.reply!, sources: payload.sources }]);
    } catch (sendError) {
      if (controller.signal.aborted || session !== sessionRef.current) return;
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a pergunta.');
    } finally {
      if (session === sessionRef.current) setLoading(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="agent-chat-dialog"
      className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--atelier-green)]/40 bg-[#18201c] px-4 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(0,0,0,0.38)] transition-colors hover:border-[var(--atelier-green)] hover:bg-[#202b24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] motion-reduce:transition-none sm:bottom-6 sm:right-6"
    >
      <ChatCircleDotsIcon size={19} weight="fill" className="text-[var(--atelier-green)]" />
      Perguntar ao agente
    </button>

    <dialog
      ref={dialogRef}
      id="agent-chat-dialog"
      aria-labelledby="agent-chat-title"
      onCancel={(event) => { event.preventDefault(); closeChat(); }}
      onClose={() => { if (open) closeChat(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeChat(); }}
      className="m-0 fixed inset-0 h-dvh max-h-dvh w-full max-w-none border-0 bg-transparent p-0 text-white backdrop:bg-black/65 backdrop:backdrop-blur-[2px] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(100%,28rem)]"
    >
      <section className="flex h-full min-h-0 flex-col border-t border-white/10 bg-[#111719] shadow-[-18px_0_60px_rgba(0,0,0,0.32)] sm:border-l sm:border-t-0">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><SparkleIcon size={20} weight="fill" /></span>
            <div className="min-w-0">
              <h2 ref={titleRef} tabIndex={-1} id="agent-chat-title" className="font-semibold outline-none">Assistente do CRM</h2>
              <p className="mt-1 text-xs leading-5 text-white/45">Pesquisa, relatório semanal e dicas de abordagem</p>
            </div>
          </div>
          <button type="button" onClick={closeChat} aria-label="Fechar conversa e apagar histórico" className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/65 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]"><XIcon size={18} /></button>
        </header>

        <div className="border-b border-white/[0.07] px-4 py-2.5 text-xs leading-5 text-white/55 sm:px-5">
          Consulto o status da pesquisa diária e o relatório semanal do CRM; não é uma auditoria completa. Esta conversa não é salva e se apaga ao fechar.
        </div>

        <div ref={messagesRef} role="log" aria-label="Conversa com o assistente" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-white/[0.08] bg-white/[0.035] p-3.5">
            <p className="text-sm leading-6 text-white/80">Posso consultar se a pesquisa de hoje rodou, resumir os números do CRM ou sugerir próximos passos com base nos dados disponíveis.</p>
          </div>
          {!messages.length ? <div className="grid gap-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Perguntas rápidas</p>
            {quickQuestions.map((question) => <button key={question} type="button" onClick={() => void sendMessage(question)} disabled={loading} className="min-h-11 rounded-lg border border-white/[0.08] px-3 text-left text-xs text-white/70 transition-colors hover:border-[var(--atelier-green)]/35 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] disabled:opacity-50 motion-reduce:transition-none">{question}</button>)}
          </div> : null}
          {messages.map((message) => <article key={message.id} className={`max-w-[94%] rounded-2xl p-3.5 ${message.role === 'user' ? 'ml-auto rounded-tr-md bg-[var(--atelier-green)]/10 text-white' : 'rounded-tl-md border border-white/[0.08] bg-white/[0.035] text-white/80'}`}>
            <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
            {message.sources ? <SourceNote sources={message.sources} /> : null}
          </article>)}
          {loading ? <div role="status" className="flex max-w-[85%] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 text-xs text-white/55"><CircleNotchIcon size={15} className="animate-spin text-[var(--atelier-green)] motion-reduce:animate-none" /> Consultando pesquisa e relatório…</div> : null}
          {error ? <p role="alert" className="rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-xs leading-5 text-red-100">{error}</p> : null}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-white/10 bg-[#111719] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
          <label htmlFor="agent-chat-input" className="sr-only">Sua pergunta para o agente</label>
          <div className="flex items-end gap-2 rounded-xl border border-white/12 bg-[#171e22] p-2 focus-within:border-[var(--atelier-green)]/55">
            <input
              ref={inputRef}
              id="agent-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 500))}
              maxLength={500}
              autoComplete="off"
              placeholder="Pergunte sobre a pesquisa ou o CRM…"
              className="min-h-10 min-w-0 flex-1 bg-transparent px-2 text-base text-white outline-none placeholder:text-white/35 sm:text-sm"
            />
            <button type="submit" disabled={loading || draft.trim().length < 2} aria-label="Enviar pergunta" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)] text-[#101507] transition-colors hover:bg-[var(--atelier-green-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">
              {loading ? <CircleNotchIcon size={18} className="animate-spin motion-reduce:animate-none" /> : <PaperPlaneTiltIcon size={18} weight="fill" />}
            </button>
          </div>
          <p className="mt-2 px-1 text-xs text-white/50">Até 500 caracteres · sem alteração no funil ou envio de mensagens</p>
        </form>
      </section>
    </dialog>
  </>;
}

function SourceNote({ sources }: { sources: ChatSources }) {
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
    : null;
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(sources.preparedAt));
  const reportRange = sources.reportAvailable && sources.reportFrom && sources.reportTo
    ? `relatório CRM ${date(sources.reportFrom)}–${date(new Date(new Date(sources.reportTo).getTime() - 1).toISOString())}`
    : 'relatório indisponível';
  const research = !sources.researchAvailable
    ? `status da pesquisa indisponível em ${date(`${sources.researchDate}T12:00:00-03:00`)}`
    : sources.researchStatus
      ? `pesquisa Overture ${date(`${sources.researchDate}T12:00:00-03:00`)} · ${sources.researchCandidates} candidatas`
      : `pesquisa Overture sem registro em ${date(`${sources.researchDate}T12:00:00-03:00`)} · prevista às ${sources.scheduledTime}`;
  return <p className="mt-3 border-t border-white/[0.07] pt-2 text-xs leading-4 text-white/50">Dados: {research} · {reportRange} · consultado às {time} · {sources.engine === 'GEMINI' ? 'Gemini (faixa gratuita)' : 'resposta local'}</p>;
}
