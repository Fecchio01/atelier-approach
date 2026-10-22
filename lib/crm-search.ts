type SearchableLead = {
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  category: string | null;
};

function normalizeWords(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

function normalizeCompact(value: string) {
  return normalizeWords(value).replace(/\s/g, '');
}

export function searchCrmLeads<T extends SearchableLead>(leads: T[], query: string): T[] {
  const words = normalizeWords(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return leads;

  return leads.filter((lead) => {
    const searchableValues = [lead.name, lead.phone, lead.whatsapp, lead.website, lead.instagram, lead.address, lead.category]
      .filter((value): value is string => Boolean(value));
    const wordIndex = normalizeWords(searchableValues.join(' '));
    const compactContactIndex = normalizeCompact([lead.phone, lead.whatsapp].filter(Boolean).join(' '));

    return words.every((word) => wordIndex.includes(word) || compactContactIndex.includes(normalizeCompact(word)));
  });
}
