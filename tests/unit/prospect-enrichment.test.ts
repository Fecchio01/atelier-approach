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

test('does not return a prospect when its linked physical business identity conflicts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta property="og:image" content="https://img.example/vizinha.jpg"><script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Vizinha","telephone":"+55 24 3333-4444","address":{"@type":"PostalAddress","streetAddress":"Rua das Flores, 45","addressLocality":"Volta Redonda","addressRegion":"RJ"}}</script><a href="https://wa.me/552433334444">WhatsApp</a>',
    { status: 200 }
  )));

  const businesses = await enrichOvertureBusinesses([{
    osmId: 'overture/real-conflict-contacts', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://oficina-real-conflict.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(businesses).toEqual([]);
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

test('excludes a conflicting named business instead of keeping its wrongly associated website', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Vizinha","telephone":"+55 21 98888-7777","address":{"@type":"PostalAddress","addressLocality":"Niterói","addressRegion":"RJ"}}</script><a href="https://wa.me/5521988887777">WhatsApp</a>',
    { status: 200 }
  )));

  const businesses = await enrichOvertureBusinesses([{
    osmId: 'overture/real', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://realoficina.example', phone: '+5521991112222', whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(businesses).toEqual([]);
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

test('uses the matched official phone instead of a conflicting source phone', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Real","telephone":"+55 24 3333-4444","address":{"@type":"PostalAddress","addressLocality":"Volta Redonda","addressRegion":"RJ"}}</script>',
    { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/real-conflict', name: 'Oficina Real', category: 'automotive_repair',
    source: 'Overture', website: 'https://real-conflict.example', phone: '+5521991112222', whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ'
  }]);

  expect(business.phone).toBe('+552433334444');
  expect(business.phoneSource).toBe('site oficial verificado');
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

test('excludes a place whose website identifies a different business at the supplied address', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"Hospital","name":"Casa de Saúde Pinheiro Machado","telephone":"+55 21 2125-4882","address":{"streetAddress":"Rua Pinheiro Machado, 151","addressLocality":"Rio de Janeiro","addressRegion":"RJ"}}</script>',
    { status: 200 }
  )));

  const businesses = await enrichOvertureBusinesses([{
    osmId: 'overture/contradicted-cafe', name: 'Café Aurora', category: 'coffee_shop', source: 'Overture',
    website: 'https://contradicted-cafe.example', phone: '+552121254882', whatsapp: null, instagram: null,
    address: 'Rua Pinheiro Machado, 151, Rio de Janeiro, RJ'
  }]);

  expect(businesses).toEqual([]);
});

test('keeps each structured business contacts attached to its matching identity instead of the first entity or footer', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
    <a href="tel:+551133334444">Agência</a>
    <a href="https://wa.me/551133334444">Agência WhatsApp</a>
    <a href="https://instagram.com/agenciadotemplate">Agência Instagram</a>
    <script type="application/ld+json">{"@graph":[
      {"@type":"Organization","name":"Agência do Template","telephone":"+55 11 3333-4444","sameAs":["https://instagram.com/agenciadotemplate"],"address":{"addressLocality":"São Paulo","addressRegion":"SP"}},
      {"@type":"AutoRepair","name":"Oficina Aurora","telephone":"+55 19 3203-5110","sameAs":["https://instagram.com/oficinaaurora","https://wa.me/551932035110"],"address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}
    ]}</script>`, { status: 200 }
  )));

  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/contextual-entity', name: 'Oficina Aurora', category: 'automotive_repair', source: 'Overture',
    website: 'https://contextual-entity.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);

  expect(business).toMatchObject({
    name: 'Oficina Aurora', phone: '+551932035110', whatsapp: 'https://wa.me/551932035110',
    instagram: 'https://instagram.com/oficinaaurora', phoneSource: 'site oficial verificado'
  });
});

test('replaces stale source phone with the current number of the verified official business', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Atual","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script><a href="https://wa.me/551932035110">WhatsApp</a>',
    { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/stale-source-phone', name: 'Oficina Atual', source: 'Overture',
    website: 'https://stale-source-phone.example', phone: '+551932034444', whatsapp: 'https://wa.me/551932034444', instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);

  expect(business).toMatchObject({ phone: '+551932035110', whatsapp: 'https://wa.me/551932035110', phoneSource: 'site oficial verificado' });
});

test('does not call a source phone verified when the site provides no matching business identity', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html><title>Site em manutenção</title></html>', { status: 200 })));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/unverified-label', name: 'Oficina Atual', source: 'Overture',
    website: 'https://unverified-label.example', phone: '+551932035110', whatsapp: null, instagram: null
  }]);

  expect(business.phone).toBe('+551932035110');
  expect(business.phoneSource).not.toBe('site oficial verificado');
});

test('does not borrow a same-named branch contact from a different city even if the street name matches', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Aurora","telephone":"+55 11 3333-4444","address":{"streetAddress":"Rua das Flores","addressLocality":"São Paulo","addressRegion":"SP"}}</script><a href="https://wa.me/551133334444">WhatsApp</a>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/wrong-branch-city', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://wrong-branch-city.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business.phone).toBeNull();
  expect(business.whatsapp).toBeNull();
});

test('matches a full state name to its abbreviation for the same official address', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Aurora","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"São Paulo"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/full-state-name', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://full-state-name.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business.phone).toBe('+551932035110');
  expect(business.phoneSource).toBe('site oficial verificado');
});

test('does not borrow a same-city branch contact when both street addresses contradict', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Oficina Aurora","telephone":"+55 19 3203-5110","address":{"streetAddress":"Avenida Central, 900","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/wrong-branch-street', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://wrong-branch-street.example', phone: null, whatsapp: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business.phone).toBeNull();
  expect(business.phoneSource).toBeNull();
});

test('rejects a hospital identity even when it contains the café brand name at the same address', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"Hospital","name":"Hospital Vida Nova","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  expect(await enrichOvertureBusinesses([{
    osmId: 'overture/hospital-subset', name: 'Vida Nova', category: 'cafe', source: 'Overture',
    website: 'https://hospital-subset.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }])).toEqual([]);
});

test('does not accept a street number merely because it is a prefix of another branch number', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"AutoRepair","name":"Oficina Aurora","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/street-prefix', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://street-prefix.example', phone: null, instagram: null,
    address: 'Rua das Flores, 450, Campinas, SP'
  }]);
  expect(business.phone).toBeNull();
});

test('preserves an exact legitimate short brand identity', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"AutoRepair","name":"Auto LG","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/short-brand', name: 'Auto LG', source: 'Overture',
    website: 'https://short-brand.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business).toMatchObject({ name: 'Auto LG', phone: '+551932035110', phoneSource: 'site oficial verificado' });
});

test('does not borrow a branch contact when source state is a full name that contradicts the official state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"AutoRepair","name":"Oficina Aurora","telephone":"+55 82 3333-4444","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"São Sebastião","addressRegion":"Alagoas"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/state-conflict', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://state-conflict.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, São Sebastião, São Paulo'
  }]);
  expect(business.phone).toBeNull();
  expect(business.phoneSource).toBeNull();
});

test('does not mistake the website author agency for the company being researched', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<meta property="og:site_name" content="Oficina Aurora"><script type="application/ld+json">{"@type":"WebPage","author":{"@type":"Organization","name":"Agência do Template","telephone":"+55 11 3333-4444","address":{"addressLocality":"São Paulo","addressRegion":"SP"}}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/agency-author', name: 'Oficina Aurora', source: 'Overture',
    website: 'https://agency-author.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business).toMatchObject({ name: 'Oficina Aurora', phone: null, whatsapp: null, phoneSource: null });
});

test('matches a short brand when the official business adds its service description', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"AutoRepair","name":"Auto LG Serviços Automotivos","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/short-brand-description', name: 'Auto LG', category: 'automotive_repair', source: 'Overture',
    website: 'https://short-brand-description.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business).toMatchObject({ name: 'Auto LG', phone: '+551932035110' });
});

test('keeps a record with ambiguous branding without borrowing an unverified identity', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<script type="application/ld+json">{"@type":"AutoRepair","name":"Oficina A Serviços Automotivos","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}</script>', { status: 200 }
  )));
  const [business] = await enrichOvertureBusinesses([{
    osmId: 'overture/ambiguous-brand', name: 'Oficina A', category: 'automotive_repair', source: 'Overture',
    website: 'https://ambiguous-brand.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  }]);
  expect(business).toMatchObject({ name: 'Oficina A', phone: null, phoneSource: null });
});

test('does not reuse another sector entity from the website cache', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(
    '<script type="application/ld+json">[{"@type":"CafeOrCoffeeShop","name":"Aurora","telephone":"+55 19 3203-5110","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}},{"@type":"HairSalon","name":"Aurora","telephone":"+55 19 3203-5220","address":{"streetAddress":"Rua das Flores, 45","addressLocality":"Campinas","addressRegion":"SP"}}]</script>', { status: 200 }
  )));
  const source: ExternalBusiness = {
    osmId: 'overture/cache-sector', name: 'Aurora', source: 'Overture',
    website: 'https://cache-sector.example', phone: null, instagram: null,
    address: 'Rua das Flores, 45, Campinas, SP'
  };
  const [cafe] = await enrichOvertureBusinesses([{ ...source, category: 'cafe' }]);
  const [salon] = await enrichOvertureBusinesses([{ ...source, category: 'hair_salon' }]);
  expect(cafe.phone).toBe('+551932035110');
  expect(salon.phone).toBe('+551932035220');
});
