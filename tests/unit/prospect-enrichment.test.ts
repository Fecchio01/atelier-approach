import { afterEach, expect, test, vi } from 'vitest';

import { enrichFromOfficialWebsite } from '../../lib/prospect-enrichment';

afterEach(() => {
  vi.restoreAllMocks();
});

test('extracts public WhatsApp, Instagram, telephone and Open Graph image links', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        '<meta property="og:image" content="https://img.example/cover.jpg" /><a href="https://wa.me/5519999990000">WhatsApp</a><a href="https://instagram.com/oficina">Instagram</a><a href="tel:+551932035110">Telefone</a>',
        { status: 200 }
      )
    )
  );

  await expect(enrichFromOfficialWebsite('https://oficina.example')).resolves.toEqual({
    website: 'https://oficina.example/',
    whatsapp: 'https://wa.me/5519999990000',
    instagram: 'https://instagram.com/oficina',
    phone: '+551932035110',
    imageUrl: 'https://img.example/cover.jpg'
  });
});

test('ignores unsafe links and returns empty fields when the official site fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  await expect(enrichFromOfficialWebsite('javascript:alert(1)')).resolves.toEqual({
    website: null,
    whatsapp: null,
    instagram: null,
    phone: null,
    imageUrl: null
  });
});
