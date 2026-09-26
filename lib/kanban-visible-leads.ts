export function visibleLeads<T extends { id: string }>(leads: T[], removedIds: string[]): T[] {
  if (removedIds.length === 0) return leads;
  const removed = new Set(removedIds);
  return leads.filter((lead) => !removed.has(lead.id));
}
