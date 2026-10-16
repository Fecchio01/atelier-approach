import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { lookupCompany, BRAZIL_REGIONS, type LookupRequest, type MapsPhoneCandidate } from './lookup.js';

export function createApp(options: {
  token: string;
  lookup?: (request: LookupRequest) => Promise<MapsPhoneCandidate[]>;
}) {
  if (!options.token.trim()) throw new Error('MAPS_PHONE_SERVICE_TOKEN is required');
  const lookup = options.lookup ?? lookupCompany;
  const app = express();
  app.disable('x-powered-by');
  app.post('/lookup', (req, res, next) => {
    const received = Buffer.from(req.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${options.token}`);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }, express.json({ limit: '8kb' }), async (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Invalid lookup request' });
      return;
    }
    const data = body as Record<string, unknown>;
    const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && [...value].every(character => character.charCodeAt(0) >= 32);
    if (Object.keys(data).some(key => !['companyName', 'city', 'region', 'address'].includes(key)) ||
      !text(data.companyName, 300) || !text(data.city, 150) || !text(data.region, 2) ||
      !BRAZIL_REGIONS.has(data.region.toUpperCase()) ||
      (data.address !== undefined && data.address !== null && !text(data.address, 500))) {
      res.status(400).json({ error: 'Invalid lookup request' });
      return;
    }
    const input: LookupRequest = { companyName: data.companyName.trim(), city: data.city.trim(), region: data.region.toUpperCase() };
    if (data.address !== undefined) input.address = data.address === null ? null : (data.address as string).trim();
    try {
      const candidates = (await lookup(input)).slice(0, 5).map(({ name, phone, address, city, region }) => ({ name, phone, address, city, region }));
      res.json({ candidates });
    } catch {
      res.status(502).json({ error: 'Maps lookup failed' });
    }
  });
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid lookup request' });
  });
  return app;
}

export function readConfig(env: {
  PORT?: string;
  MAPS_PHONE_SERVICE_TOKEN?: string;
  [key: string]: string | undefined;
}) {
  const token = env.MAPS_PHONE_SERVICE_TOKEN;
  if (!token?.trim()) throw new Error('MAPS_PHONE_SERVICE_TOKEN is required');
  const value = env.PORT ?? '9000';
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  return { token, port };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { token, port } = readConfig(process.env);
  createApp({ token }).listen(port, '0.0.0.0');
}
