import { requireApiKey } from "@/lib/search/auth";
import { getSearchRuntimeConfig } from "@/lib/search/config";
import { executeSearch } from "@/lib/search/search";
import { SearchApiError } from "@/lib/search/types";
import { parseSearchRequest } from "@/lib/search/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const headers = corsHeaders(request);

  try {
    requireApiKey(request);

    const config = getSearchRuntimeConfig();
    const searchRequest = parseSearchRequest(
      new URL(request.url).searchParams,
      config.defaultLimit,
    );
    const requestTimeoutMs = config.interactiveCaptchaEnabled
      ? Math.max(
          config.timeoutMs,
          config.interactiveCaptchaTimeoutMs + 10_000,
        )
      : config.timeoutMs;
    const googleCookieHeader = request.headers.get("x-google-cookie")?.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const search = await executeSearch(searchRequest, {
        browserFallbackEnabled: config.browserFallbackEnabled,
        browserTimeoutMs: config.browserTimeoutMs,
        interactiveCaptchaEnabled: config.interactiveCaptchaEnabled,
        interactiveCaptchaTimeoutMs: config.interactiveCaptchaTimeoutMs,
        signal: controller.signal,
        deadline: Date.now() + requestTimeoutMs,
        googleCookie: googleCookieHeader || searchRequest.googleCookie,
        userAgent: config.userAgent,
      });
      const errors = search.warnings.filter(
        (warning) => warning.code !== "partial_results",
      );
      const warnings = search.warnings.filter(
        (warning) => warning.code === "partial_results",
      );
      if (
        search.results.length > 0 &&
        search.results.length < searchRequest.limit
      ) {
        warnings.push({
          code: "partial_results",
          message: `Collected ${search.results.length} results out of requested ${searchRequest.limit}. Some engines may limit or throttle pagination.`,
        });
      }
      const captchaError = errors.find((warning) => {
        return (
          warning.code === "blocked" &&
          warning.details !== undefined &&
          typeof warning.details.captchaUrl === "string"
        );
      });
      const captchaUrl =
        captchaError && captchaError.details
          ? String(captchaError.details.captchaUrl)
          : null;

      return json(
        {
          query: searchRequest.query,
          type: searchRequest.type,
          engines: searchRequest.engines,
          requestedLimit: searchRequest.limit,
          returned: search.results.length,
          results: search.results,
          captcha_required: captchaUrl !== null,
          captchaUrl,
          errors,
          warnings,
          elapsedMs: Date.now() - startedAt,
        },
        200,
        headers,
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return errorJson(error, headers);
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      allow: "GET, OPTIONS",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
    },
  });
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      ...headers,
      "cache-control": "no-store",
    },
  });
}

function errorJson(error: unknown, headers: HeadersInit) {
  if (error instanceof SearchApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      error.status,
      headers,
    );
  }

  return json(
    {
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Internal server error.",
      },
    },
    500,
    headers,
  );
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigins =
    process.env.SEARCH_ALLOWED_ORIGINS?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];

  if (!origin || allowedOrigins.length === 0) {
    return {};
  }

  if (allowedOrigins.includes("*")) {
    return {
      "access-control-allow-origin": "*",
    };
  }

  if (allowedOrigins.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      vary: "Origin",
    };
  }

  return {};
}
