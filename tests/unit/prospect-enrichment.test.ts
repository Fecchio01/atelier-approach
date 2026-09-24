import { afterEach, expect, test, vi } from 'vitest';

import { enrichFromOfficialWebsite, enrichOvertureBusinesses } from '../../lib/prospect-enrichment';

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
    name: null,
    whatsapp: 'https://wa.me/5519999990000',
    instagram: 'https://instagram.com/oficina',
    phone: '+551932035110',
    imageUrl: 'https://img.example/cover.jpg'
  });
});

test('extracts the public company name, phone and social links from official metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta property="og:site_name" content="Auto Brilho Premium"><script type="application/ld+json">{"@type":"AutoRepair","name":"Auto Brilho Premium","telephone":"+55 11 3333-0000","sameAs":["https://instagram.com/autobrilho"]}</script>',
    { status: 200 }
  )));

  await expect(enrichFromOfficialWebsite('https://official-metadata.example')).resolves.toMatchObject({
    name: 'Auto Brilho Premium',
    phone: '+551133330000',
    instagram: 'https://instagram.com/autobrilho'
  });
});

test('does not follow website redirects to internal addresses', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
    status: 302,
    headers: { Location: 'http://127.0.0.1/private' }
  }));
  vi.stubGlobal('fetch', fetchMock);

  await expect(enrichFromOfficialWebsite('https://redirecting-site.example')).resolves.toMatchObject({
    name: null,
    phone: null,
    whatsapp: null,
    instagram: null
  });
  expect(fetchMock).toHaveBeenCalledWith('https://redirecting-site.example/', expect.objectContaining({ redirect: 'manual' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('ignores unsafe links and returns empty fields when the official site fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  await expect(enrichFromOfficialWebsite('javascript:alert(1)')).resolves.toEqual({
    website: null,
    name: null,
    whatsapp: null,
    instagram: null,
    phone: null,
    imageUrl: null
  });
  await expect(enrichFromOfficialWebsite('https://broken-dns.example')).resolves.toMatchObject({ website: null });
});

test('enriches Overture prospects from a reachable official website without replacing the source name', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<a href="https://wa.me/5521999990000">WhatsApp</a><a href="https://instagram.com/realoficina">Instagram</a>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/1', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://realoficina.example', phone: null, whatsapp: null, instagram: null
  }]);

  expect(business).toMatchObject({
    name: 'Oficina Real', website: 'https://realoficina.example/',
    whatsapp: 'https://wa.me/5521999990000', instagram: 'https://instagram.com/realoficina'
  });
});

test('does not present a missing website as a working site', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(enrichFromOfficialWebsite('https://missing-site.example')).resolves.toMatchObject({ website: null });
});
