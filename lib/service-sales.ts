type BillingType = 'ONE_TIME' | 'MONTHLY';

// Decimal(12,2) prices are parsed as integer cents, never floating-point sums.
export function priceInCents(price: unknown): number {
  if (typeof price !== 'string' && typeof price !== 'number') throw new Error('Preço inválido.');
  const value = String(price);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error('Preço inválido.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function summarizeServiceItems(items: readonly { price: string | number; billingType: BillingType }[]): { saleValue: number; mrr: number } {
  let saleCents = 0;
  let mrrCents = 0;
  for (const item of items) {
    const cents = priceInCents(item.price);
    saleCents += cents;
    if (item.billingType === 'MONTHLY') mrrCents += cents;
    if (!Number.isSafeInteger(saleCents)) throw new Error('Total monetário inválido.');
  }
  return { saleValue: saleCents / 100, mrr: mrrCents / 100 };
}

type ServiceData = { name?: string; price?: string; billingType?: BillingType; isActive?: boolean };

export function parseServiceData(body: unknown, partial = false): ServiceData | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const data: ServiceData = {};
  if (!partial || 'name' in input) {
    if (typeof input.name !== 'string' || !input.name.trim()) return null;
    data.name = input.name.trim();
  }
  if (!partial || 'price' in input) {
    try { data.price = (priceInCents(input.price) / 100).toFixed(2); } catch { return null; }
  }
  if (!partial || 'billingType' in input) {
    if (input.billingType !== 'ONE_TIME' && input.billingType !== 'MONTHLY') return null;
    data.billingType = input.billingType;
  }
  if ('isActive' in input) {
    if (typeof input.isActive !== 'boolean') return null;
    data.isActive = input.isActive;
  }
  return Object.keys(data).length ? data : null;
}
