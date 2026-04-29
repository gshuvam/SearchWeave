import { timingSafeEqual } from "node:crypto";
import { SearchApiError } from "./types";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::",
  "[::]",
  "::1",
  "[::1]",
]);

export function requireApiKey(
  request: Request,
  expectedKey = process.env.SEARCH_API_KEY,
  allowLocalNoAuth = process.env.SEARCH_ALLOW_LOCAL_NO_AUTH,
) {
  const normalizedExpectedKey = expectedKey?.trim();

  if (!normalizedExpectedKey) {
    if (parseBoolean(allowLocalNoAuth) && isLoopbackRequest(request.url)) {
      return;
    }

    throw new SearchApiError(
      401,
      "unauthorized",
      "A valid API key is required. Set SEARCH_API_KEY, or enable SEARCH_ALLOW_LOCAL_NO_AUTH=true for localhost requests.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !safeEqual(match[1], normalizedExpectedKey)) {
    throw new SearchApiError(401, "unauthorized", "A valid API key is required.");
  }
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function parseBoolean(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isLoopbackRequest(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (LOOPBACK_HOSTS.has(hostname)) {
      return true;
    }

    return hostname.startsWith("127.");
  } catch {
    return false;
  }
}
