import { summarizeServiceItems } from './service-sales';

export type CommercialServiceOption = {
  id: string;
  name: string;
  price: string;
  billingType: 'ONE_TIME' | 'MONTHLY';
};

export function getSelectedServiceSummary(
  services: readonly CommercialServiceOption[],
  selectedIds: readonly string[]
) {
  const selected = new Set(selectedIds);
  return summarizeServiceItems(services
    .filter((service) => selected.has(service.id))
    .map(({ price, billingType }) => ({ price, billingType })));
}
