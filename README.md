# SearchAPI

Authenticated text and image search API for Vercel. It scrapes DuckDuckGo, Bing, Google, and Brave on a best-effort basis, returns normalized JSON, and includes a small same-origin console at `/`.

## Local setup

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`, set `SEARCH_API_KEY`, then use the console or call the API directly.

## API

```bash
curl "http://localhost:3000/api/search?q=vercel&type=text&engine=duckduckgo,bing&limit=10" \
  -H "Authorization: Bearer $SEARCH_API_KEY"
```

Query parameters:

- `q`: required search keyword
- `type`: `text` or `image`, default `text`
- `engine`: comma-separated list from `duckduckgo,bing,google,brave`
- `limit`: positive integer, default `SEARCH_DEFAULT_LIMIT` or `50`
- `google_cookie`: optional Google cookie header string for CAPTCHA resume (`NID=...; 1P_JAR=...`)

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

`errors` contains engine failures (`blocked`, `fetch_error`, `parse_error`, `timeout`, `unknown_error`).
`warnings` contains non-fatal notices (`partial_results`) only.
When CAPTCHA is required, the API also returns `captcha_required: true` and `captchaUrl`.

## Vercel environment variables

- `SEARCH_API_KEY`: required API key checked against the `Authorization` bearer token.
- `SEARCH_DEFAULT_LIMIT`: optional default result limit, defaults to `50`.
- `SEARCH_REQUEST_TIMEOUT_MS`: optional request time budget, defaults to `25000`.
- `SEARCH_ENABLE_BROWSER_FALLBACK`: optional (`true`/`false`), enables Puppeteer browser fallback after normal scraping fails.
- `SEARCH_BROWSER_TIMEOUT_MS`: optional browser fallback timeout, defaults to `45000`.
- `SEARCH_ENABLE_INTERACTIVE_CAPTCHA`: optional (`true`/`false`), when `true` launches Puppeteer in non-headless mode and waits for manual CAPTCHA solve in that browser session.
- `SEARCH_INTERACTIVE_CAPTCHA_TIMEOUT_MS`: optional wait timeout for interactive CAPTCHA mode, defaults to `180000`.
- `SEARCH_USER_AGENT`: optional scraper user agent.
- `SEARCH_ALLOWED_ORIGINS`: optional comma-separated origins for cross-origin API calls.

## Notes

Search engine scraping is inherently best-effort. Engines can change markup, block requests, or require CAPTCHA, especially from serverless infrastructure. When Google serves CAPTCHA, the API returns `errors[].details.captchaUrl` and a resume hint (`google_cookie`) so you can solve and retry.

If `SEARCH_ENABLE_INTERACTIVE_CAPTCHA=true`, Google fallback switches to an interactive browser session and waits for the CAPTCHA to be solved in that session before parsing results. Keep it `false` on Vercel/serverless and use the existing `captchaUrl` + `google_cookie` resume flow.
