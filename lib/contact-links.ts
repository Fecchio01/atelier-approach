const BRAZIL_AREA_CODE = /^(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/;

/** A single published phone in Brazil context; formatting is not ownership verification. */
export function normalizePublishedPhone(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null;
  // Anatel CNGs use a domestic service prefix plus seven digits, without a DDD.
  // Preserve their dial string instead of pretending the prefix is an area code.
  const serviceDigits = input.replace(/\D/g, '');
  if (!input.startsWith('+') && /^(?:0300|0303|0500|0800)\d{7}$/.test(serviceDigits)) return serviceDigits;
  const digits = normalizeNumber(input, true);
  return digits ? `+${digits}` : null;
}

// This validates a published target's format, never whether it has a live account.
// Only call with a field explicitly declared as WhatsApp, not a general telephone.
export function toWhatsAppHref(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;
  if (/^\+?[\d\s().-]+$/.test(input)) {
    const phone = normalizeNumber(input, true);
    return phone ? `https://wa.me/${phone}` : null;
  }

  const candidate = /^(?:wa\.me|api\.whatsapp\.com)(?:[/?#]|$)/i.test(input) ? `https://${input}` : input;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;

    let number: string;
    if (url.hostname.toLowerCase() === 'wa.me' && /^\/\d+\/?$/.test(url.pathname)) {
      if (url.searchParams.has('phone')) return null;
      number = url.pathname.replace(/\//g, '');
    } else if (url.hostname.toLowerCase() === 'api.whatsapp.com' && /^\/send\/?$/.test(url.pathname)) {
      if (url.searchParams.getAll('phone').length !== 1) return null;
      number = url.searchParams.get('phone') ?? '';
      if (!/^\d+$/.test(number)) return null;
    } else {
      // Opaque short links need destination validation before they are actionable.
      return null;
    }

    const phone = normalizeNumber(number, false);
    if (!phone) return null;
    const href = new URL(`https://wa.me/${phone}`);
    const text = url.searchParams.get('text');
    if (text) href.searchParams.set('text', text);
    return href.toString();
  } catch {
    return null;
  }
}

function normalizeNumber(value: string, allowBrazilLocal: boolean): string | null {
  let digits = value.replace(/\D/g, '');
  if (allowBrazilLocal && !value.startsWith('+')) {
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    else if (!/^55\d{10,11}$/.test(digits)) return null;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  if (!digits.startsWith('55')) return digits;

  const local = digits.slice(2);
  if (!BRAZIL_AREA_CODE.test(local.slice(0, 2))) return null;
  const subscriber = local.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return null;
  return /^(?:[2-5]\d{7}|9\d{8})$/.test(subscriber) ? digits : null;
}
