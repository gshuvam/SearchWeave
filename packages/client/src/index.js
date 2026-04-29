import { createAuthHeaders, resolveClientConfig, SearchWeaveConfigError } from "./config.js";

export { SearchWeaveConfigError } from "./config.js";

export class SearchWeaveRequestError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "SearchWeaveRequestError";
    this.status = status;
    this.details = details;
  }
}

export class SearchWeaveClient {
  constructor(options = {}) {
    this.config = resolveClientConfig(options);
    // Validate auth requirement up front so CLIs can prompt before requests.
    createAuthHeaders(this.config.baseUrl, this.config.apiKey);
    this.fetcher = options.fetcher ?? globalThis.fetch;

    if (typeof this.fetcher !== "function") {
      throw new SearchWeaveConfigError(
        "missing_fetch",
        "A fetch implementation is required. Provide options.fetcher in non-fetch runtimes.",
      );
    }
  }

  async search(params) {
    const payload = normalizeSearchParams(params);
    const endpoint = new URL("/api/search", `${this.config.baseUrl}/`);
    endpoint.searchParams.set("q", payload.q);

    if (payload.type) {
      endpoint.searchParams.set("type", payload.type);
    }

    if (payload.engine) {
      endpoint.searchParams.set("engine", payload.engine);
    }

    if (payload.limit !== undefined) {
      endpoint.searchParams.set("limit", String(payload.limit));
    }

    if (payload.google_cookie) {
      endpoint.searchParams.set("google_cookie", payload.google_cookie);
    }

    const headers = {
      "content-type": "application/json",
      ...createAuthHeaders(this.config.baseUrl, this.config.apiKey),
    };

    const response = await this.fetcher(endpoint, {
      method: "GET",
      headers,
    });

    const parsedBody = await parseResponseBody(response);
    if (!response.ok) {
      const message =
        parsedBody?.error?.message ||
        `SearchWeave request failed with status ${response.status}.`;
      throw new SearchWeaveRequestError(message, response.status, parsedBody);
    }

    return parsedBody;
  }
}

export {
  createAuthHeaders,
  getConfigPath,
  isLoopbackBaseUrl,
  loadConfigFile,
  resolveClientConfig,
  saveConfigFile,
} from "./config.js";

async function parseResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeSearchParams(params) {
  if (!params || typeof params !== "object") {
    throw new SearchWeaveConfigError(
      "invalid_search_params",
      "search(params) requires an options object.",
    );
  }

  const query = String(params.q ?? "").trim();
  if (!query) {
    throw new SearchWeaveConfigError(
      "missing_query",
      "search(params) requires a non-empty q value.",
    );
  }

  const type = normalizeOptionalString(params.type);
  if (type && type !== "text" && type !== "image") {
    throw new SearchWeaveConfigError(
      "invalid_type",
      "type must be text or image when provided.",
    );
  }

  const engine = normalizeEngine(params.engine);

  const limit = params.limit === undefined ? undefined : Number(params.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new SearchWeaveConfigError(
      "invalid_limit",
      "limit must be a positive integer when provided.",
    );
  }

  return {
    q: query,
    ...(type ? { type } : {}),
    ...(engine ? { engine } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(normalizeOptionalString(params.google_cookie)
      ? { google_cookie: normalizeOptionalString(params.google_cookie) }
      : {}),
  };
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeEngine(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(",");
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}
