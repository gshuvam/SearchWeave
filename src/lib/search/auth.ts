import { timingSafeEqual } from "node:crypto";
import { SearchApiError } from "./types";

export function requireApiKey(
  request: Request,
  expectedKey = process.env.SEARCH_API_KEY,
) {
  if (!expectedKey) {
    throw new SearchApiError(
      500,
      "missing_server_api_key",
      "SEARCH_API_KEY is not configured.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !safeEqual(match[1], expectedKey)) {
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
