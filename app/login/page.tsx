import { signIn } from '@/lib/auth';

export default function LoginPage() {
  async function authenticate(formData: FormData) {
    'use server';

    formData.set('redirectTo', '/');
    await signIn('credentials', formData);
  }

  return (
    <section className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm border border-[var(--atelier-green)] p-8">
        <p className="text-sm font-medium tracking-[0.2em] text-[var(--atelier-green)]">ATELIER APPROACH</p>
        <h1 className="mt-4 text-3xl font-semibold">Acesso interno</h1>
        <p className="mt-3 text-sm text-white/75">Faça login para acessar a plataforma.</p>
        <form action={authenticate} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium" htmlFor="email">
              E-mail
            </label>
            <input
              className="mt-1 w-full border border-white/30 bg-black px-3 py-2 text-white"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="password">
              Senha
            </label>
            <input
              className="mt-1 w-full border border-white/30 bg-black px-3 py-2 text-white"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="w-full bg-[var(--atelier-green)] px-4 py-2 font-semibold text-black" type="submit">
            Entrar
          </button>
        </form>
      </div>
    </section>
  );
}
