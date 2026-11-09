import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arvelo Approach',
  applicationName: 'Arvelo Approach',
  description: 'Plataforma comercial Arvelo',
  icons: {
    icon: [
      { url: '/icons/arvelo-approach-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/arvelo-approach-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/icons/arvelo-approach-apple.png', sizes: '180x180', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    title: 'Arvelo Approach',
    statusBarStyle: 'black-translucent'
  }
};

export const viewport: Viewport = {
  themeColor: '#070a08',
  colorScheme: 'dark'
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
