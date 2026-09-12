import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isRequiredAuthEndpoint =
    pathname === '/api/auth/csrf' || pathname === '/api/auth/callback/credentials';

  if (pathname === '/login' || isRequiredAuthEndpoint) {
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
