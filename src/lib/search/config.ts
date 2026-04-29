const FALLBACK_DEFAULT_LIMIT = 50;
const FALLBACK_TIMEOUT_MS = 25_000;
const FALLBACK_BROWSER_TIMEOUT_MS = 45_000;
const FALLBACK_INTERACTIVE_CAPTCHA_TIMEOUT_MS = 180_000;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; SearchAPI/1.0; +https://vercel.com)";

type SearchRuntimeConfig = {
  defaultLimit: number;
  timeoutMs: number;
  browserFallbackEnabled: boolean;
  browserTimeoutMs: number;
  interactiveCaptchaEnabled: boolean;
  interactiveCaptchaTimeoutMs: number;
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
    browserFallbackEnabled: parseBoolean(env.SEARCH_ENABLE_BROWSER_FALLBACK),
    browserTimeoutMs: parsePositiveInteger(
      env.SEARCH_BROWSER_TIMEOUT_MS,
      FALLBACK_BROWSER_TIMEOUT_MS,
    ),
    interactiveCaptchaEnabled: parseBoolean(
      env.SEARCH_ENABLE_INTERACTIVE_CAPTCHA,
    ),
    interactiveCaptchaTimeoutMs: parsePositiveInteger(
      env.SEARCH_INTERACTIVE_CAPTCHA_TIMEOUT_MS,
      FALLBACK_INTERACTIVE_CAPTCHA_TIMEOUT_MS,
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

function parseBoolean(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
