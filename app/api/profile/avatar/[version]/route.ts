import { getCurrentUser } from '@/lib/auth';
import { getProfileAvatarImage } from '@/lib/profile-avatar';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ version: string }> }) {
  const [{ version }, user] = await Promise.all([params, getCurrentUser()]);
  const image = user && user.imageVersion.toString() === version && user.image
    ? getProfileAvatarImage(user.image)
    : null;
  if (!image) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new Response(image.bytes, {
    headers: {
      'Cache-Control': 'private, max-age=3600, immutable',
      'Content-Length': String(image.bytes.length),
      'Content-Type': image.contentType,
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
