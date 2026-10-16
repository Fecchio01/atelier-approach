# Maps phone lookup service

Independent, synchronous Express service. It searches one quoted company name
with its city and Brazilian UF, inspects up to five rendered unique Maps results,
and returns only observed name, geographic phone, address, city and region.
It does not scroll the result feed. Unknown locality stays empty instead of
being inferred from the request. Mobile numbers are never labeled WhatsApp.

From this directory, use Node 22 or newer:

```powershell
npm ci
npx playwright install chromium
npm test
npm run build
$env:MAPS_PHONE_SERVICE_TOKEN = 'replace-with-a-private-token'
$env:PORT = '9000'
npm start
```

`POST /lookup` requires `Authorization: Bearer <token>` and JSON:

```json
{ "companyName": "Nome da empresa", "city": "Belo Horizonte", "region": "MG", "address": null }
```

The optional `address` accepts a string or null. The service searches using name,
city and UF; the caller can compare the observed address with its input address.
Successful responses are `{ "candidates": [...] }`, including an empty array
when no matching phone-bearing result is observed. Each candidate has exactly
`name`, `phone` (E.164 `+55`), `address`, `city`, and `region`.
Invalid input returns 400, unauthorized requests 401, oversized JSON 413, and
Maps/browser failures 502. No jobs, result cache, database, webhook, or persistent
browser context are created. Every request closes its browser context and browser.

Build from this directory with `docker build -f Dockerfile.vercel -t maps-phone .`.
The image pins Playwright and its Chromium runtime to 1.64.1 and checks browser
launch during the build. Run it with `--init --ipc=host`, the token environment
variable, and a port mapping; the server binds to `0.0.0.0:$PORT`.

Tests replace only external Maps HTTP responses with controlled pages and launch
real Chromium. See NOTICE and LICENSE for the limited upstream adaptation.
