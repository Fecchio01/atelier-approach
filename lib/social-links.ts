const RESERVED_INSTAGRAM_PATHS = new Set([
  'about',
  'accounts',
  'challenge',
  'developer',
  'direct',
  'explore',
  'graphql',
  'p',
  'reel',
  'reels',
  'stories',
  'tv',
]);

/** Returns a canonical Instagram profile URL, or null for any other link. */
export function normalizeInstagramProfileUrl(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;

  let handle: string;
  if (/^@?[a-z0-9._]+$/i.test(input)) {
    handle = input.replace(/^@/, '');
  } else {
    const candidate = /^(?:www\.)?instagram\.com(?:\/|$)/i.test(input)
      ? `https://${input}`
      : input;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }

    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null;
    if (url.username || url.password || url.port) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    handle = segments[0];
  }

  if (!/^[a-z0-9._]{1,30}$/i.test(handle)) return null;
  if (RESERVED_INSTAGRAM_PATHS.has(handle.toLowerCase())) return null;
  return `https://www.instagram.com/${handle}/`;
}
