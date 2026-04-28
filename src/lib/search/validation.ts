import {
  SEARCH_ENGINES,
  SEARCH_TYPES,
  SearchApiError,
  type ParsedSearchRequest,
  type SearchEngine,
  type SearchType,
} from "./types";

const engineSet = new Set<string>(SEARCH_ENGINES);
const typeSet = new Set<string>(SEARCH_TYPES);

export function parseSearchRequest(
  searchParams: URLSearchParams,
  defaultLimit: number,
): ParsedSearchRequest {
  const query = searchParams.get("q")?.trim();
  if (!query) {
    throw new SearchApiError(400, "missing_query", "Query parameter q is required.");
  }

  const typeValue = searchParams.get("type")?.trim().toLowerCase() || "text";
  if (!typeSet.has(typeValue)) {
    throw new SearchApiError(400, "invalid_type", "type must be text or image.");
  }

  const engineParam = searchParams.get("engine")?.trim();
  if (!engineParam) {
    throw new SearchApiError(
      400,
      "missing_engine",
      "engine is required and may contain a comma-separated engine list.",
    );
  }

  const engines = parseEngines(engineParam);
  const limit = parseLimit(searchParams.get("limit"), defaultLimit);

  return {
    query,
    type: typeValue as SearchType,
    engines,
    limit,
  };
}

export function parseEngines(engineParam: string): SearchEngine[] {
  const engines = Array.from(
    new Set(
      engineParam
        .split(",")
        .map((engine) => engine.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (engines.length === 0) {
    throw new SearchApiError(400, "missing_engine", "At least one engine is required.");
  }

  const invalid = engines.filter((engine) => !engineSet.has(engine));
  if (invalid.length > 0) {
    throw new SearchApiError(
      400,
      "invalid_engine",
      `Unsupported engine: ${invalid.join(", ")}.`,
      { supported: SEARCH_ENGINES },
    );
  }

  return engines as SearchEngine[];
}

export function parseLimit(value: string | null, defaultLimit: number): number {
  if (value === null || value.trim() === "") {
    return defaultLimit;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new SearchApiError(400, "invalid_limit", "limit must be a positive integer.");
  }

  return parsed;
}
