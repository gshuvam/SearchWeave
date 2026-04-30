import { adapters } from "./adapters";
import { dedupeResults } from "./dedupe";
import type {
  ParsedSearchRequest,
  ScrapeContext,
  SearchEngine,
  SearchResult,
  SearchWarning,
} from "./types";

type ExecuteSearchOptions = Pick<
  ScrapeContext,
  | "browserFallbackEnabled"
  | "browserTimeoutMs"
  | "deadline"
  | "fetcher"
  | "googleCookie"
  | "interactiveCaptchaEnabled"
  | "interactiveCaptchaTimeoutMs"
  | "signal"
  | "userAgent"
>;

export async function executeSearch(
  request: ParsedSearchRequest,
  options: ExecuteSearchOptions,
) {
  const settled = await Promise.allSettled(
    request.engines.map((engine) => runEngine(engine, request, options)),
  );

  const results: SearchResult[] = [];
  const warnings: SearchWarning[] = [];

  settled.forEach((entry, index) => {
    const engine = request.engines[index];

    if (entry.status === "fulfilled") {
      results.push(...entry.value.results);
      warnings.push(...entry.value.warnings);
      return;
    }

    warnings.push({
      engine,
      code: "unknown_error",
      message:
        entry.reason instanceof Error
          ? entry.reason.message
          : "Engine search failed.",
    });
  });

  return {
    results: dedupeResults(results, request.limit),
    warnings,
  };
}

async function runEngine(
  engine: SearchEngine,
  request: ParsedSearchRequest,
  options: ExecuteSearchOptions,
) {
  const adapter = adapters[engine];
  const context: ScrapeContext = {
    query: request.query,
    limit: request.limit,
    nsfw: request.nsfw,
    ...options,
  };

  return request.type === "image"
    ? adapter.searchImages(context)
    : adapter.searchText(context);
}
