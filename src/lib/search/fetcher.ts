import type { SearchEngine, SearchWarning } from "./types";

export class EngineFetchError extends Error {
  code: SearchWarning["code"];
  status?: number;

  constructor(code: SearchWarning["code"], message: string, status?: number) {
    super(message);
    this.name = "EngineFetchError";
    this.code = code;
    this.status = status;
  }
}

type FetchTextOptions = {
  engine: SearchEngine;
  signal: AbortSignal;
  userAgent: string;
  fetcher?: typeof fetch;
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
  referer?: string;
  cookie?: string;
  onSetCookies?: (cookies: string[]) => void;
};

export async function fetchText(url: string, options: FetchTextOptions) {
  try {
    const headers: Record<string, string> = {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": options.userAgent,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    };

    if (options.contentType) {
      headers["content-type"] = options.contentType;
    }

    if (options.referer) {
      headers.referer = options.referer;
    }

    if (options.cookie) {
      headers.cookie = options.cookie;
    }

    const response = await (options.fetcher ?? fetch)(url, {
      method: options.method ?? "GET",
      body: options.body,
      cache: "no-store",
      redirect: "follow",
      signal: options.signal,
      headers,
    });

    if ([401, 403, 429, 503].includes(response.status)) {
      throw new EngineFetchError(
        "blocked",
        `${options.engine} blocked or throttled the request.`,
        response.status,
      );
    }

    if (!response.ok) {
      throw new EngineFetchError(
        "fetch_error",
        `${options.engine} returned HTTP ${response.status}.`,
        response.status,
      );
    }

    const getSetCookie = (
      response.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    if (options.onSetCookies && typeof getSetCookie === "function") {
      options.onSetCookies(getSetCookie.call(response.headers));
    }

    return response.text();
  } catch (error) {
    if (error instanceof EngineFetchError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new EngineFetchError("timeout", `${options.engine} search timed out.`);
    }

    throw new EngineFetchError(
      "fetch_error",
      error instanceof Error
        ? error.message
        : `${options.engine} request failed.`,
    );
  }
}

export function warningFromError(engine: SearchEngine, error: unknown): SearchWarning {
  if (error instanceof EngineFetchError) {
    return {
      engine,
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  return {
    engine,
    code: "unknown_error",
    message: error instanceof Error ? error.message : "Unknown search error.",
  };
}

export function hasTimeRemaining(deadline: number) {
  return Date.now() < deadline - 250;
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}
