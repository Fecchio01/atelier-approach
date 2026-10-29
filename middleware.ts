import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import authConfig from '@/lib/auth-config';

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isRequiredAuthEndpoint =
    pathname === '/api/auth/csrf' || pathname === '/api/auth/callback/credentials';
  const isPublicCronEndpoint = pathname === '/api/cron/crm-lifecycle'
    || pathname === '/api/cron/follow-up-cadence'
    || pathname === '/api/cron/autonomous-prospecting'
    || pathname === '/api/cron/autonomous-prospecting-retry';
  const isMessagingWebhook = pathname === '/api/webhooks/messaging';
  const isPublicBrandAsset = pathname.startsWith('/brand/');

  if (pathname === '/login' || isRequiredAuthEndpoint || isPublicCronEndpoint || isMessagingWebhook || isPublicBrandAsset) {
    return NextResponse.next();
  }

  if (request.auth?.user?.id) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', request.url));
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)']
};
