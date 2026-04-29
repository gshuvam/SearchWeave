# SearchAPI

SearchWeave monorepo with:

- Next.js local API server (`/api/search`)
- npm SDK: `@searchweave/client`
- npm CLI: `@searchweave/cli` (`searchweave`)
- Python SDK + CLI: `searchweave` (`searchweave-py`)

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`.

For local-only development without API keys:

```bash
SEARCH_ALLOW_LOCAL_NO_AUTH=true
```

With `SEARCH_ALLOW_LOCAL_NO_AUTH=true`, requests to localhost/loopback are allowed with no `Authorization` header.

## API

```bash
curl "http://localhost:3000/api/search?q=vercel&type=text&engine=duckduckgo,bing&limit=10" \
  -H "Authorization: Bearer $SEARCH_API_KEY"
```

Response shape:

```json
{
  "query": "vercel",
  "type": "text",
  "engines": ["duckduckgo", "bing"],
  "requestedLimit": 10,
  "returned": 10,
  "results": [],
  "captcha_required": false,
  "captchaUrl": null,
  "errors": [],
  "warnings": [],
  "elapsedMs": 1200
}
```

## npm packages

### `@searchweave/client`

Programmatic SDK:

```js
import { SearchWeaveClient } from "@searchweave/client";

const client = new SearchWeaveClient({
  baseUrl: "http://127.0.0.1:3000",
  apiKey: "", // blank is allowed for localhost only
});

const data = await client.search({
  q: "vercel",
  type: "text",
  engine: "duckduckgo,bing",
  limit: 10,
});
```

Config precedence: explicit args > env (`SEARCH_API_BASE_URL`, `SEARCH_API_KEY`) > config file > defaults.

Config file:

- Windows: `%APPDATA%/SearchWeave/config.json`
- Linux/macOS: `$XDG_CONFIG_HOME/searchweave/config.json` or `~/.config/searchweave/config.json`

### `@searchweave/cli`

```bash
searchweave config init
searchweave config set --base-url http://127.0.0.1:3000 --api-key ""
searchweave config show
searchweave search --q "vercel" --engine duckduckgo,bing --limit 10
```

## Python package

### `searchweave` SDK

```python
from searchweave import SearchWeaveClient

client = SearchWeaveClient(base_url="http://127.0.0.1:3000", api_key="")
result = client.search(q="vercel", engine="duckduckgo,bing", limit=10)
```

### `searchweave-py` CLI

```bash
searchweave-py config init
searchweave-py config set --base-url http://127.0.0.1:3000 --api-key ""
searchweave-py config show
searchweave-py search --q "vercel" --engine duckduckgo,bing --limit 10
```

## Environment variables

- `SEARCH_API_KEY`: API key for server-side auth.
- `SEARCH_ALLOW_LOCAL_NO_AUTH`: `true`/`false`; allows no-auth localhost requests when `SEARCH_API_KEY` is blank.
- `SEARCH_DEFAULT_LIMIT`: optional default result limit, default `50`.
- `SEARCH_REQUEST_TIMEOUT_MS`: optional request timeout, default `25000`.
- `SEARCH_ENABLE_BROWSER_FALLBACK`: optional (`true`/`false`), enables Puppeteer fallback.
- `SEARCH_BROWSER_TIMEOUT_MS`: optional browser fallback timeout, default `45000`.
- `SEARCH_ENABLE_INTERACTIVE_CAPTCHA`: optional (`true`/`false`), non-headless CAPTCHA flow.
- `SEARCH_INTERACTIVE_CAPTCHA_TIMEOUT_MS`: optional, default `180000`.
- `SEARCH_USER_AGENT`: optional scraper user agent.
- `SEARCH_ALLOWED_ORIGINS`: optional comma-separated CORS allow list.

## CI and release tags

GitHub workflows publish packages from tags:

- `npm-client-vX.Y.Z` -> `@searchweave/client`
- `npm-cli-vX.Y.Z` -> `@searchweave/cli`
- `py-vX.Y.Z` -> `searchweave` (PyPI)

The workflows are set up for trusted publishing (OIDC) with npm and PyPI.