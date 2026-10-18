import { afterEach, expect, test, vi } from 'vitest';

import { enrichFromOfficialWebsite, enrichOvertureBusinesses } from '../../lib/prospect-enrichment';
import type { ExternalBusiness } from '../../lib/osm';

afterEach(() => {
  vi.restoreAllMocks();
});

test('preserves Overture phone and explicit WhatsApp when no website exists', async () => {
  const sourcePhone = '+55 (19) 3203-5110';
  const sourceWhatsApp = 'https://wa.me/551932035110';

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/no-website', name: 'Oficina Horizonte', category: 'automotive_repair',
    source: 'Overture', website: null, phone: sourcePhone, whatsapp: sourceWhatsApp, instagram: null
  }]);

  expect(business).toMatchObject({ phone: sourcePhone, whatsapp: sourceWhatsApp });
});

test('never derives WhatsApp from an Overture phone', async () => {
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/phone-only', name: 'Oficina Horizonte', category: 'automotive_repair',
    source: 'Overture', website: null, phone: '+551932035110', whatsapp: null, instagram: null
  }]);

  expect(business.whatsapp).toBeNull();
});

test('keeps the phone attached to the Overture place when its website cannot independently verify it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<title>Oficina Horizonte</title>', { status: 200 })));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/source-phone', name: 'Oficina Horizonte', category: 'automotive_repair',
    source: 'Overture', website: 'https://source-phone-horizonte.example', phone: '+55 19 3203-5110', whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business).toMatchObject({ phone: '+55 19 3203-5110', whatsapp: null });
});

test('does not use website contacts or photo when the website identity conflicts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta property="og:image" content="https://img.example/vizinha.jpg"><script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Vizinha","telephone":"+55 24 3333-4444","address":{"@type":"PostalAddress","streetAddress":"Rua das Flores, 45","addressLocality":"Volta Redonda","addressRegion":"RJ"}}</script><a href="https://wa.me/552433334444">WhatsApp</a>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real-conflict-contacts', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://oficina-real-conflict.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business).toMatchObject({ phone: null, whatsapp: null, imageUrl: undefined });
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
    imageUrl: 'https://img.example/cover.jpg',
    structuredBusinessName: null,
    structuredStreetAddress: null,
    structuredLocality: null,
    structuredRegion: null
  });
});

test('uses the official Twitter image when a site has no Open Graph image', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta name="twitter:title" content="Oficina Horizonte"><meta name="twitter:image" content="https://img.example/horizonte.jpg">',
    { status: 200 }
  )));

  await expect(enrichFromOfficialWebsite('https://horizonte.example')).resolves.toMatchObject({
    name: 'Oficina Horizonte',
    imageUrl: 'https://img.example/horizonte.jpg'
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
    imageUrl: null,
    structuredBusinessName: null,
    structuredStreetAddress: null,
    structuredLocality: null,
    structuredRegion: null
  });
  await expect(enrichFromOfficialWebsite('https://broken-dns.example')).resolves.toMatchObject({ website: null });
});

test('does not trust website contacts without structured identity, but keeps Overture phone data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<a href="https://wa.me/5521999990000">WhatsApp</a><a href="https://instagram.com/realoficina">Instagram</a>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/1', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://realoficina.example', phone: '+5521991112222',
    whatsapp: 'https://wa.me/5521991112222', instagram: 'https://instagram.com/realoficina'
  }]);

  expect(business).toMatchObject({
    name: 'Oficina Real', website: 'https://realoficina.example', phone: '+5521991112222',
    whatsapp: null, instagram: 'https://instagram.com/realoficina'
  });
});

test('suppresses phone and WhatsApp when the website publishes a conflicting number', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Vizinha","telephone":"+55 21 98888-7777","address":{"@type":"PostalAddress","addressLocality":"Niterói","addressRegion":"RJ"}}</script><a href="https://wa.me/5521988887777">WhatsApp</a>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://realoficina.example', phone: '+5521991112222', whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business.phone).toBeNull();
  expect(business.whatsapp).toBeNull();
  expect(business.phoneSource).toBeNull();
  expect(business.website).toBe('https://realoficina.example');
  expect(business.instagram).toBeNull();
});

test('accepts phone only when official-site name and location match the Overture business', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Real","telephone":"+55 24 3333-4444","address":{"@type":"PostalAddress","streetAddress":"Rua das Flores, 45","addressLocality":"Volta Redonda","addressRegion":"RJ"}}</script><a href="https://wa.me/552433334444">WhatsApp</a>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real-match', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://real-match.example', phone: null, whatsapp: null,
    instagram: 'https://instagram.com/oficina-real',
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business).toMatchObject({
    phone: '+552433334444', whatsapp: 'https://wa.me/552433334444', phoneSource: 'site oficial verificado',
    instagram: 'https://instagram.com/oficina-real'
  });
});

test('rejects a conflicting Overture phone even when the official website identity matches', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Real","telephone":"+55 24 3333-4444","address":{"@type":"PostalAddress","addressLocality":"Volta Redonda","addressRegion":"RJ"}}</script>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real-conflict', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://real-conflict.example', phone: '+5521991112222', whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business.phone).toBeNull();
  expect(business.phoneSource).toBeNull();
});

test('does not present a missing website as a working site', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(enrichFromOfficialWebsite('https://missing-site.example')).resolves.toMatchObject({ website: null });
});

test('checks every Overture website in the returned batch, including after the tenth', async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) =>
    url.includes('eleventh-broken')
      ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
      : Promise.resolve(new Response('<html>OK</html>', { status: 200 }))
  );
  vi.stubGlobal('fetch', fetchMock);
  const businesses = Array.from({ length: 11 }, (_, index) => ({
    osmId: `overture/${index}`, name: `Oficina ${index}`, source: 'Overture' as const,
    website: `https://${index === 10 ? 'eleventh-broken' : `working-${index}`}.example`,
    phone: null, instagram: null, whatsapp: null
  }));

  const enriched = await enrichOvertureBusinesses(businesses);

  expect(enriched[0].website).toBe('https://working-0.example');
  expect(enriched[10].website).toBe('https://eleventh-broken.example');
  expect(fetchMock).toHaveBeenCalledTimes(11);
});

test('keeps images from different profiles on the same host separate', async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(
    url.includes('/oficina-a')
      ? '<meta property="og:title" content="Oficina A"><meta property="og:image" content="https://img.example/a.jpg">'
      : '<meta property="og:title" content="Oficina B"><meta property="og:image" content="https://img.example/b.jpg">',
    { status: 200 }
  )));
  vi.stubGlobal('fetch', fetchMock);

  const first = await enrichFromOfficialWebsite('https://profiles.example/oficina-a');
  const second = await enrichFromOfficialWebsite('https://profiles.example/oficina-b');

  expect(first.imageUrl).toBe('https://img.example/a.jpg');
  expect(second.imageUrl).toBe('https://img.example/b.jpg');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('does not assign another brand profile image to an Overture business', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(
    url.includes('/bianquini-garage')
      ? '<meta property="og:title" content="Bianquini Garage Official: Instagram | Linktree"><meta property="og:image" content="https://img.example/bianquini.jpg">'
      : '<meta property="og:title" content="Automecânica Multimarcas Official: Instagram | Linktree"><meta property="og:image" content="https://img.example/multimarcas.jpg">',
    { status: 200 }
  ))));

  const businesses: ExternalBusiness[] = [
    { osmId: 'overture/ph', name: 'PH Serviços Automotivos', source: 'Overture', website: 'https://link-profiles.example/bianquini-garage', phone: null, whatsapp: null, instagram: null },
    { osmId: 'overture/auto', name: 'Auto Mecânica e Auto Peças Multimarcas', source: 'Overture', website: 'https://link-profiles.example/amecanicamultimarcas', phone: null, whatsapp: null, instagram: null }
  ];

  const enriched = await enrichOvertureBusinesses(businesses);

  expect(enriched[0].imageUrl).toBeUndefined();
  expect(enriched[1].imageUrl).toBeUndefined();
});

test('uses a matching official page title to recover its photo when it has no structured location', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta property="og:title" content="Oficina Real"><meta property="og:image" content="https://img.example/oficina-real.jpg">',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real-photo', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://oficina-real.example', phone: null, whatsapp: null,
    instagram: 'https://instagram.com/oficina-real', address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business).toMatchObject({
    imageUrl: 'https://img.example/oficina-real.jpg',
    instagram: 'https://instagram.com/oficina-real'
  });
  expect(business.phone).toBeNull();
  expect(business.whatsapp).toBeNull();
});
