const BUSINESS_NICHE_LABELS: Record<string, string> = {
  automotive_repair: 'Oficina mecânica',
  auto_repair: 'Oficina mecânica',
  car_repair: 'Oficina mecânica',
  vehicle_repair: 'Oficina mecânica',
  auto_detailing: 'Estética automotiva',
  car_detailing: 'Estética automotiva',
  car_wash: 'Lava-jato',
  barber: 'Barbearia',
  barber_shop: 'Barbearia',
  barbershop: 'Barbearia',
  beauty_salon: 'Salão de beleza',
  hair_care: 'Salão de beleza',
  fitness_center: 'Academia',
  gym: 'Academia',
  dentist: 'Dentista',
  dental_clinic: 'Clínica odontológica',
  restaurant: 'Restaurante',
  pet_store: 'Pet shop',
  pet_shop: 'Pet shop',
  carpet_store: 'Loja de tapetes',
  auto_parts: 'Autopeças',
  auto_parts_store: 'Autopeças',
  car_parts: 'Autopeças'
};

export function getBusinessNicheLabel(category: string | null | undefined) {
  if (!category?.trim()) return 'Não identificado';

  const trimmed = category.trim();
  const key = normalizeCategory(trimmed);
  return BUSINESS_NICHE_LABELS[key] ?? titleCase(trimmed.replace(/[_-]+/g, ' '));
}

function normalizeCategory(category: string) {
  return category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
