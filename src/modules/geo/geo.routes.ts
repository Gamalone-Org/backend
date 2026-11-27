import type { Request, Response } from 'express';
import { Router } from 'express';
import geoip from 'geoip-country';

// Headers a reverse proxy may set with the visitor's country:
// Cloudflare (cf-ipcountry), nginx with the GeoIP2 module (x-country-code), Vercel.
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-country-code', 'x-vercel-ip-country'];

const isCountryCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{2}$/i.test(value) && !/^(XX|T1)$/i.test(value);

export const resolveCountry = (req: Request): string | null => {
  for (const name of COUNTRY_HEADERS) {
    const value = req.headers[name];
    if (isCountryCode(value)) return value.toUpperCase();
  }
  // No proxy header: look the IP up in the GeoIP database shipped with geoip-country (no outside service).
  return req.ip ? (geoip.lookup(req.ip)?.country ?? null) : null;
};

export const geoRouter = Router();

/**
 * GET /api/v1/geo
 * Country of the visitor, used by the frontend to pick the site language and currency.
 */
geoRouter.get('/', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ country: resolveCountry(req) });
});

export default geoRouter;
