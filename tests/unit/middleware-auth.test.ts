import { NextRequest } from 'next/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler })
}));

import middleware from '../../middleware';

const runMiddleware = middleware as unknown as (request: NextRequest) => Response | undefined;

describe('authentication middleware', () => {
  test('allows the protected lifecycle cron route through while redirecting other protected APIs', async () => {
    const cronResponse = runMiddleware(
      new NextRequest('http://localhost/api/cron/crm-lifecycle')
    );
    const protectedApiResponse = runMiddleware(
      new NextRequest('http://localhost/api/leads')
    );

    expect(cronResponse?.status).toBe(200);
    expect(cronResponse?.headers.get('x-middleware-next')).toBe('1');
    expect(protectedApiResponse?.status).toBe(307);
    expect(protectedApiResponse?.headers.get('location')).toBe('http://localhost/login');
  });
});
