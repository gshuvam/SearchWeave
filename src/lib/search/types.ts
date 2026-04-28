export const SEARCH_ENGINES = [
  "duckduckgo",
  "bing",
  "google",
  "brave",
] as const;

export const SEARCH_TYPES = ["text", "image"] as const;

export type SearchEngine = (typeof SEARCH_ENGINES)[number];
export type SearchType = (typeof SEARCH_TYPES)[number];

export type SearchWarningCode =
  | "blocked"
  | "fetch_error"
  | "parse_error"
  | "timeout"
  | "unknown_error";

export type TextSearchResult = {
  engine: SearchEngine;
  type: "text";
  title: string;
  snippet: string;
  url: string;
  displayUrl: string;
};

export type ImageSearchResult = {
  engine: SearchEngine;
  type: "image";
  title: string;
  snippet: string;
  url: string;
  displayUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
};

export type SearchResult = TextSearchResult | ImageSearchResult;

export type SearchWarning = {
  engine?: SearchEngine;
  code: SearchWarningCode;
  message: string;
  status?: number;
};

export type ParsedSearchRequest = {
  query: string;
  type: SearchType;
  engines: SearchEngine[];
  limit: number;
};

export type ScrapeContext = {
  query: string;
  limit: number;
  signal: AbortSignal;
  deadline: number;
  userAgent: string;
  fetcher?: typeof fetch;
};

export type AdapterSearchResponse = {
  results: SearchResult[];
  warnings: SearchWarning[];
};

export type SearchAdapter = {
  engine: SearchEngine;
  searchText: (context: ScrapeContext) => Promise<AdapterSearchResponse>;
  searchImages: (context: ScrapeContext) => Promise<AdapterSearchResponse>;
};

export class SearchApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SearchApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
