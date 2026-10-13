const maxAvatarBytes = 300 * 1024;

const imageSignatures: Record<string, (bytes: Buffer) => boolean> = {
  jpeg: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  png: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
};

export function isValidProfileAvatar(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return true;
  } catch {
    // Continue with data URL validation.
  }

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;

  const [, format, encoded] = match;
  if (encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length > 0 && bytes.length <= maxAvatarBytes && imageSignatures[format](bytes);
}

export function getProfileAvatarImage(value: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !isValidProfileAvatar(value)) return null;

  const [, format, encoded] = match;
  return { contentType: `image/${format}`, bytes: Buffer.from(encoded, 'base64') };
}
