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

Response shape:

```json
{
  "query": "vercel",
  "type": "text",
  "engines": ["duckduckgo", "bing"],
  "requestedLimit": 10,
  "returned": 10,
  "results": [],
  "warnings": [],
  "elapsedMs": 1200
}
```

## Vercel environment variables

- `SEARCH_API_KEY`: required API key checked against the `Authorization` bearer token.
- `SEARCH_DEFAULT_LIMIT`: optional default result limit, defaults to `50`.
- `SEARCH_REQUEST_TIMEOUT_MS`: optional request time budget, defaults to `25000`.
- `SEARCH_USER_AGENT`: optional scraper user agent.
- `SEARCH_ALLOWED_ORIGINS`: optional comma-separated origins for cross-origin API calls.

## Notes

Search engine scraping is inherently best-effort. Engines can change markup, block requests, or require CAPTCHA, especially from serverless infrastructure. The API returns partial results with `warnings` when an engine fails, times out, or is blocked.
