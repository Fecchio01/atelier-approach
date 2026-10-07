import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arvello',
  applicationName: 'Arvello',
  description: 'Plataforma comercial Arvello',
  icons: {
    icon: '/brand/arvello_approach_sem_nome_fundo_preto.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
