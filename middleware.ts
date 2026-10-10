import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from '@/lib/auth-config';
import { isCronAuthExemptPath } from '@/lib/middleware-paths';

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isRequiredAuthEndpoint =
    pathname === '/api/auth/csrf' || pathname === '/api/auth/callback/credentials';
  const isPublicBrandAsset = pathname.startsWith('/brand/');
  const isLifecycleCron = isCronAuthExemptPath(pathname);

  if (pathname === '/login' || isRequiredAuthEndpoint || isPublicBrandAsset || isLifecycleCron) {
    return NextResponse.next();
  }

  if (request.auth?.user?.id) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', request.url));
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
