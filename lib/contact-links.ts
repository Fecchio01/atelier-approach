export function possibleWhatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  return /^\d{2}9\d{8}$/.test(local) ? `https://wa.me/55${local}` : null;
}
