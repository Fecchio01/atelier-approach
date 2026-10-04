import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { ChartLineUpIcon, MagnifyingGlassIcon, SquaresFourIcon } from '@phosphor-icons/react/dist/ssr';

import { signIn } from '@/lib/auth';
import { BrandLogo } from '@/components/brand-logo';
import { LoginSubmitButton } from '@/components/login-submit-button';

const steps = [
  { icon: MagnifyingGlassIcon, title: 'Encontre', description: 'Pesquise empresas por região e nicho.' },
  { icon: SquaresFourIcon, title: 'Acompanhe', description: 'Organize cada conversa no funil.' },
  { icon: ChartLineUpIcon, title: 'Evolua', description: 'Veja metas e resultados em um só lugar.' }
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; password?: string }> }) {
  const params = await searchParams;

  async function authenticate(formData: FormData) {
    'use server';

    formData.set('redirectTo', '/');
    try {
      await signIn('credentials', formData);
    } catch (error) {
      if (error instanceof AuthError && error.type === 'CredentialsSignin') {
        redirect('/login?error=credentials');
      }
      throw error;
    }
  }

  return <main className="grid min-h-dvh bg-[#080c0e] text-white lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,0.92fr)]">
    <section className="relative isolate hidden overflow-hidden border-r border-white/10 px-[clamp(3rem,6vw,7rem)] pb-12 pt-12 lg:flex lg:flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-80" style={{ background: 'radial-gradient(circle at 12% 12%, rgba(167,216,26,.16), transparent 30%), linear-gradient(120deg, transparent 65%, rgba(167,216,26,.045) 65.1%, transparent 65.3%), repeating-linear-gradient(0deg, transparent 0, transparent 54px, rgba(255,255,255,.035) 55px)' }} />
      <div className="flex flex-col items-start gap-2">
        <BrandLogo className="w-[172px]" priority />
        <span className="pl-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/40">Sua operação comercial</span>
      </div>

      <div className="mt-16 max-w-xl lg:my-auto lg:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--atelier-green)]">Pesquisa · CRM · Resultados</p>
        <h1 className="mt-6 max-w-[12ch] text-balance text-[clamp(3.2rem,5.8vw,6.6rem)] font-semibold leading-[0.98] tracking-[-0.075em]">Seu próximo negócio começa aqui.</h1>
        <p className="mt-7 max-w-[48ch] text-base leading-7 text-white/60">Da primeira pesquisa ao fechamento, acompanhe cada oportunidade com clareza.</p>
      </div>

      <div className="mt-12 grid max-w-2xl gap-3 sm:grid-cols-3 lg:mt-0">
        {steps.map((step, index) => <div key={step.title} className="border-t border-white/15 pt-4"><div className="flex items-center gap-2 text-[var(--atelier-green)]"><step.icon size={18} weight="duotone" /><span className="text-[10px] font-semibold tabular-nums tracking-[0.2em]">0{index + 1}</span></div><h2 className="mt-3 text-sm font-semibold">{step.title}</h2><p className="mt-1 text-xs leading-5 text-white/45">{step.description}</p></div>)}
      </div>
    </section>

    <section className="relative flex min-h-dvh items-start justify-center overflow-hidden px-5 py-8 sm:items-center sm:px-10 sm:py-12 lg:min-h-0 lg:px-[clamp(2.5rem,6vw,7rem)]" aria-labelledby="login-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,rgba(167,216,26,.1),transparent_45%)] lg:hidden" />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-6 flex items-center lg:hidden"><BrandLogo className="w-[154px]" priority /></div>

        <div className="mb-6 lg:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--atelier-green)]">Pesquisa · CRM · Resultados</p>
          <h1 className="mt-3 max-w-[15ch] text-balance text-[clamp(1.85rem,8vw,2.35rem)] font-semibold leading-[1.04] tracking-[-0.065em]">Seu próximo negócio começa aqui.</h1>
          <p className="mt-2 max-w-[42ch] text-sm leading-5 text-white/55">Da primeira pesquisa ao fechamento, acompanhe cada oportunidade com clareza.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {steps.map((step) => <div key={step.title} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] px-2 py-2.5">
              <step.icon size={17} weight="duotone" className="text-[var(--atelier-green)]" />
              <h2 className="mt-1.5 truncate text-[11px] font-semibold text-white/85">{step.title}</h2>
            </div>)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-5 flex items-center gap-2 text-xs font-medium text-white/55 lg:mb-10"><span className="size-2 rounded-full bg-[var(--atelier-green)] shadow-[0_0_18px_rgba(167,216,26,.55)]" /> Acesso à equipe Arvello</div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--atelier-green)]">Bem-vindo de volta</p>
          <h2 id="login-title" className="mt-3 text-[clamp(1.75rem,7vw,2.2rem)] font-semibold tracking-[-0.055em] lg:text-5xl">Entrar na plataforma</h2>
          <p className="mt-3 max-w-[37ch] text-sm leading-5 text-white/55 lg:mt-4 lg:leading-6">Use seu e-mail e sua senha para continuar de onde parou.</p>

          {params.error === 'credentials' && <p role="alert" className="mt-5 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100 lg:mt-7">E-mail ou senha não conferem. Tente novamente.</p>}
          {params.password === 'updated' && <p role="status" className="mt-5 rounded-xl border border-[var(--atelier-green)]/25 bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-[var(--atelier-green)] lg:mt-7">Senha atualizada. Entre com a nova senha.</p>}

          <form action={authenticate} className="mt-6 space-y-4 lg:mt-9 lg:space-y-5">
            <label className="block text-sm font-medium" htmlFor="email">E-mail<input className="mt-2 block min-h-[52px] w-full rounded-xl border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-[var(--atelier-green)] lg:min-h-12 lg:text-sm" id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" required /></label>
            <label className="block text-sm font-medium" htmlFor="password">Senha<input className="mt-2 block min-h-[52px] w-full rounded-xl border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-[var(--atelier-green)] lg:min-h-12 lg:text-sm" id="password" name="password" type="password" autoComplete="current-password" placeholder="Sua senha" required /></label>
            <LoginSubmitButton />
          </form>
          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-white/40 lg:mt-8 lg:pt-6">Seu perfil e a troca de senha ficam disponíveis dentro da plataforma.</p>
        </div>
      </div>
    </section>
  </main>;
}
