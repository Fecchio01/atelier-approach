import { priceInCents, summarizeServiceItems } from './service-sales';

export type CommercialServiceOption = {
  id: string;
  name: string;
  price: string;
  billingType: 'ONE_TIME' | 'MONTHLY';
};

export function getSelectedServiceSummary(
  services: readonly CommercialServiceOption[],
  selectedIds: readonly string[],
  perSalePrices: Readonly<Record<string, string>> = {}
) {
  const selected = new Set(selectedIds);
  return summarizeServiceItems(services
    .filter((service) => selected.has(service.id))
    .map(({ id, price, billingType }) => {
      const override = perSalePrices[id];
      let effectivePrice = price;
      if (override !== undefined) {
        try {
          effectivePrice = (priceInCents(override) / 100).toFixed(2);
        } catch {
          // Keep the preview usable while the user corrects an invalid input.
        }
      }
      return { price: effectivePrice, billingType };
    }));
}
