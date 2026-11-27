import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Arvelo Approach',
    short_name: 'Arvelo',
    description: 'Plataforma comercial Arvelo',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b100e',
    theme_color: '#0b100e',
    icons: [
      {
        src: '/icons/arvelo-approach-192.png?v=3',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/arvelo-approach-512.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  };
}
