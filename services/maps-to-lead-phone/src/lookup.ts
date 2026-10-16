import { chromium, errors, type Browser, type BrowserContext, type Page } from 'playwright';

export interface LookupRequest { companyName: string; city: string; region: string; address?: string | null }
export interface MapsPhoneCandidate { name: string; phone: string; address: string; city: string; region: string }

export const BRAZIL_REGIONS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const GEOGRAPHIC_DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

// Minimal selector/detail extraction adaptation from jhowbhz/maps-to-lead.
// See NOTICE and LICENSE; no upstream job, webhook or storage code is used.
const selectors = {
  listing: 'a[href^="https://www.google.com/maps/place/"]',
  title: 'h1',
  address: 'button[data-item-id="address"]',
  phone: '[data-item-id^="phone:tel:"]',
  tel: 'a[href^="tel:"]'
};

export function normalizeBrazilPhone(raw: string): string | null {
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') && (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13))) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (!GEOGRAPHIC_DDDS.has(digits.slice(0, 2))) return null;
  if (!/^\d{2}(?:[2-5]\d{7}|9\d{8})$/.test(digits)) return null;
  return `+55${digits}`;
}

async function readCandidate(page: Page): Promise<MapsPhoneCandidate | null> {
  await page.locator(selectors.title).first().waitFor();
  // Each field may populate separately, including controls attached with empty
  // attributes. Give optional fields independent bounded waits in parallel.
  const optionalFieldTimeout = (error: unknown) => {
    if (!(error instanceof errors.TimeoutError)) throw error;
  };
  await Promise.all([
    page.waitForFunction(({ selector, regions }) => {
      const address = document.querySelector(selector)?.getAttribute('aria-label')?.replace(/^[^:]*:\s*/, '') ?? '';
      const locality = address.match(/(?:^|,)\s*([^,]+?)\s*[-–]\s*([A-Za-z]{2})(?=\s*(?:,|$))/);
      return Boolean(locality && regions.includes(locality[2].toUpperCase()));
    }, { selector: selectors.address, regions: [...BRAZIL_REGIONS] }, { timeout: 3000 }).catch(optionalFieldTimeout),
    page.waitForFunction(sel => {
      const phone = document.querySelector(sel.phone)?.getAttribute('data-item-id')?.replace(/^phone:tel:/, '') ||
        document.querySelector(sel.tel)?.getAttribute('href')?.replace(/^tel:/, '') || '';
      return /\d/.test(phone);
    }, selectors, { timeout: 3000 }).catch(optionalFieldTimeout)
  ]);
  const detail = await page.evaluate(sel => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const name = clean(document.querySelector(sel.title)?.textContent);
    const address = clean(document.querySelector(sel.address)?.getAttribute('aria-label')).replace(/^[^:]*:\s*/, '');
    const phone = document.querySelector(sel.phone)?.getAttribute('data-item-id')?.replace(/^phone:tel:/, '') || document.querySelector(sel.tel)?.getAttribute('href')?.replace(/^tel:/, '') || '';
    return { name, address, phone };
  }, selectors);
  const phone = normalizeBrazilPhone(detail.phone);
  if (!phone || !detail.name) return null;
  // Parse observed locality only. Never substitute the requested city/UF.
  const locality = detail.address.match(/(?:^|,)\s*([^,]+?)\s*[-–]\s*([A-Za-z]{2})(?=\s*(?:,|$))/);
  const region = locality?.[2]?.toUpperCase() ?? '';
  return { name: detail.name, phone, address: detail.address, city: BRAZIL_REGIONS.has(region) ? locality![1].trim() : '', region: BRAZIL_REGIONS.has(region) ? region : '' };
}

export async function lookupCompany(input: LookupRequest, launch: () => Promise<Browser> = () => chromium.launch({ headless: true })): Promise<MapsPhoneCandidate[]> {
  const browser = await launch();
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ locale: 'pt-BR', acceptDownloads: false });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(30000);
    const page = await context.newPage();
    const query = `"${input.companyName.replace(/"/g, '')}" ${input.city} ${input.region}`;
    await page.goto(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&q=${encodeURIComponent(query)}&hl=pt-BR`, { waitUntil: 'domcontentloaded' });
    await page.locator(`${selectors.listing}, ${selectors.title}`)
      .or(page.getByText(/não encontrou resultados|nenhum resultado|não há resultados|no results found/i))
      .first().waitFor({ state: 'attached' });
    const links = await page.locator(selectors.listing).evaluateAll(anchors => {
      const unique = new Set<string>();
      for (const anchor of anchors) {
        const element = anchor as HTMLAnchorElement;
        if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
        if (element.href) unique.add(element.href);
        if (unique.size === 5) break;
      }
      return [...unique];
    });
    const candidates: MapsPhoneCandidate[] = [];
    if (links.length === 0) {
      if (await page.locator(selectors.title).count()) {
        const candidate = await readCandidate(page);
        if (candidate) candidates.push(candidate);
      }
      return candidates;
    }
    for (const link of links) {
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      const candidate = await readCandidate(page);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  } finally {
    try { await context?.close(); } finally { await browser.close(); }
  }
}
