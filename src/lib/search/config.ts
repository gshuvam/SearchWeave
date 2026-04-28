const FALLBACK_DEFAULT_LIMIT = 50;
const FALLBACK_TIMEOUT_MS = 25_000;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; SearchAPI/1.0; +https://vercel.com)";

type SearchRuntimeConfig = {
  defaultLimit: number;
  timeoutMs: number;
  userAgent: string;
  allowedOrigins: string[];
};

export function getSearchRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SearchRuntimeConfig {
  return {
    defaultLimit: parsePositiveInteger(
      env.SEARCH_DEFAULT_LIMIT,
      FALLBACK_DEFAULT_LIMIT,
    ),
    timeoutMs: parsePositiveInteger(
      env.SEARCH_REQUEST_TIMEOUT_MS,
      FALLBACK_TIMEOUT_MS,
    ),
    userAgent: env.SEARCH_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    allowedOrigins:
      env.SEARCH_ALLOWED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [],
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
