import * as cheerio from "cheerio";
import { fetchWithBrowserFallback } from "../browser-fallback";
import { dedupeResults, mergeUnique } from "../dedupe";
import { fetchText, hasTimeRemaining, warningFromError } from "../fetcher";
import type {
  AdapterSearchResponse,
  ImageSearchResult,
  ScrapeContext,
  SearchAdapter,
  SearchResult,
  SearchWarning,
  TextSearchResult,
} from "../types";
import {
  cleanGoogleUrl,
  displayUrl,
  isLikelyHttpImageUrl,
  normalizeWhitespace,
  toAbsoluteUrl,
} from "../url";

const engine = "google" as const;

export const googleAdapter: SearchAdapter = {
  engine,
  searchText,
  searchImages,
};

async function searchText(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: TextSearchResult[] = [];
  const warnings: SearchWarning[] = [];
  let start = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(
      context.query,
    )}&num=10&hl=en&start=${start}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseGoogleText(html);
      if (parsed.length === 0) {
        const fallback = await runGoogleBrowserFallback(
          "text",
          url,
          context,
          html,
        );

        if (fallback.results.length > 0) {
          mergeUnique(results, fallback.results, context.limit);
          if (fallback.warning) {
            warnings.push(fallback.warning);
          }
          break;
        }

        if (fallback.warning) {
          warnings.push(fallback.warning);
        } else {
          const warning = createGoogleParseWarning("text", html);
          if (warning) {
            warnings.push(warning);
          }
        }
        break;
      }
      if (mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      start += 10;
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }
  }

  return { results, warnings };
}

async function searchImages(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: ImageSearchResult[] = [];
  const warnings: SearchWarning[] = [];
  let start = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
      context.query,
    )}&hl=en&start=${start}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseGoogleImages(html);
      if (parsed.length === 0) {
        const fallback = await runGoogleBrowserFallback(
          "image",
          url,
          context,
          html,
        );

        if (fallback.results.length > 0) {
          mergeUnique(results, fallback.results, context.limit);
          if (fallback.warning) {
            warnings.push(fallback.warning);
          }
          break;
        }

        if (fallback.warning) {
          warnings.push(fallback.warning);
        } else {
          const warning = createGoogleParseWarning("image", html);
          if (warning) {
            warnings.push(warning);
          }
        }
        break;
      }
      if (mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      start += 20;
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }
  }

  return { results, warnings };
}

function createGoogleParseWarning(
  searchType: "text" | "image",
  html: string,
): SearchWarning | null {
  const page = html.toLowerCase();

  if (looksLikeGoogleNoResultsPage(page)) {
    return null;
  }

  if (
    page.includes("our systems have detected unusual traffic") ||
    page.includes("/sorry/index") ||
    page.includes("not a robot") ||
    page.includes("if you're having trouble accessing google search") ||
    page.includes("emsg=sg_rel") ||
    page.includes("httpservice/retry/enablejs") ||
    page.includes("var g='knitsail'") ||
    page.includes("about this page")
  ) {
    return createGoogleChallengeWarning(
      `Google blocked ${searchType} scraping with an anti-bot challenge.`,
      html,
    );
  }

  if (
    page.includes("consent.google.com") ||
    page.includes("before you continue to google")
  ) {
    return {
      engine,
      code: "blocked",
      message: `Google returned a consent page instead of ${searchType} results.`,
    };
  }

  if (
    page.includes("update your browser") ||
    page.includes("your browser is not supported anymore")
  ) {
    return {
      engine,
      code: "blocked",
      message: `Google rejected the scraper client before returning ${searchType} results.`,
    };
  }

  return {
    engine,
    code: "parse_error",
    message: `Google ${searchType} markup could not be parsed. The page structure likely changed.`,
  };
}

async function runGoogleBrowserFallback(
  searchType: "text" | "image",
  searchUrl: string,
  context: ScrapeContext,
  initialHtml: string,
): Promise<{ results: SearchResult[]; warning?: SearchWarning }> {
  if (!context.browserFallbackEnabled || !context.browserTimeoutMs) {
    const parseWarning = createGoogleParseWarning(searchType, initialHtml);
    return {
      results: [],
      warning: parseWarning ?? undefined,
    };
  }

  try {
    const browserResponse = await fetchWithBrowserFallback(searchUrl, {
      timeoutMs: context.browserTimeoutMs,
      signal: context.signal,
      userAgent: context.userAgent,
      cookieHeader: context.googleCookie,
      interactiveCaptchaEnabled: context.interactiveCaptchaEnabled,
      interactiveCaptchaTimeoutMs: context.interactiveCaptchaTimeoutMs,
    });

    const parsedResults =
      searchType === "image"
        ? parseGoogleImages(browserResponse.html)
        : parseGoogleText(browserResponse.html);

    if (parsedResults.length > 0) {
      return {
        results: parsedResults,
        warning: undefined,
      };
    }

    if (browserResponse.captchaUrl || isCaptchaChallengePage(browserResponse.html)) {
      const message = context.interactiveCaptchaEnabled
        ? "Google CAPTCHA is still pending in interactive browser fallback. Complete verification in the opened browser window, then retry."
        : "Google requires CAPTCHA verification. Open captchaUrl, solve it in your browser, then retry with the solved Google cookies in the google_cookie query parameter.";
      return {
        results: [],
        warning: {
          engine,
          code: "blocked",
          message,
          details: {
            captchaUrl:
              browserResponse.captchaUrl ??
              "https://www.google.com/sorry/index",
            resumeQueryParam: "google_cookie",
          },
        },
      };
    }

    const parseWarning = createGoogleParseWarning(searchType, browserResponse.html);
    return {
      results: [],
      warning: parseWarning ?? undefined,
    };
  } catch (error) {
    return {
      results: [],
      warning: {
        engine,
        code: "fetch_error",
        message:
          error instanceof Error
            ? `Browser fallback failed: ${error.message}`
            : "Browser fallback failed for Google.",
      },
    };
  }
}

function looksLikeGoogleNoResultsPage(page: string) {
  return (
    page.includes("did not match any documents") ||
    page.includes("did not match any images") ||
    page.includes("it looks like there aren't many great matches for your search")
  );
}

function isCaptchaChallengePage(html: string) {
  const page = html.toLowerCase();
  return (
    page.includes("if you're having trouble accessing google search") ||
    page.includes("our systems have detected unusual traffic") ||
    page.includes("/sorry/index") ||
    page.includes("not a robot") ||
    page.includes("emsg=sg_rel") ||
    page.includes("about this page")
  );
}

function createGoogleChallengeWarning(message: string, html: string): SearchWarning {
  return {
    engine,
    code: "blocked",
    message,
    details: {
      captchaUrl: extractCaptchaUrlFromHtml(html) ?? "https://www.google.com/sorry/index",
      resumeQueryParam: "google_cookie",
    },
  };
}

function extractCaptchaUrlFromHtml(html: string) {
  const $ = cheerio.load(html);
  const href =
    $("a[href*='/sorry/']").first().attr("href") ??
    $("a[href*='emsg=SG_REL']").first().attr("href") ??
    $("a[href*='captcha']").first().attr("href");

  return toAbsoluteUrl(href, "https://www.google.com");
}

export function parseGoogleText(html: string): TextSearchResult[] {
  const $ = cheerio.load(html);
  const results: TextSearchResult[] = [];
  const containers = $("div.g, div[data-sokoban-container]");

  containers.each((_, element) => {
    const result = $(element);
    const link = result.find("a").has("h3").first();
    const url = cleanGoogleUrl(link.attr("href"));
    const title = normalizeWhitespace(link.find("h3").first().text());

    if (!url || !title) {
      return;
    }

    results.push({
      engine,
      type: "text",
      title,
      snippet: normalizeWhitespace(
        result.find(".VwiC3b, .IsZvec, [data-sncf]").first().text(),
      ),
      url,
      displayUrl: displayUrl(url),
    });
  });

  if (results.length === 0) {
    $("a").has("h3").each((_, element) => {
      const link = $(element);
      const url = cleanGoogleUrl(link.attr("href"));
      const title = normalizeWhitespace(link.find("h3").first().text());

      if (!url || !title) {
        return;
      }

      results.push({
        engine,
        type: "text",
        title,
        snippet: "",
        url,
        displayUrl: displayUrl(url),
      });
    });
  }

  return dedupeResults(results) as TextSearchResult[];
}

export function parseGoogleImages(html: string): ImageSearchResult[] {
  const $ = cheerio.load(html);
  const results: ImageSearchResult[] = [];

  $("a[href*='imgurl='], a[href*='/imgres']").each((_, element) => {
    const link = $(element);
    const href = link.attr("href");
    if (!href) {
      return;
    }

    const extracted = extractGoogleImageFromHref(href);
    const imageUrl = extracted.imageUrl;
    const sourceUrl = extracted.sourceUrl ?? extracted.imageUrl;
    const img = link.find("img").first();
    const dataImageUrl =
      toAbsoluteUrl(
        img.attr("data-iurl") ??
          img.attr("data-ou") ??
          img.attr("data-src") ??
          img.attr("src"),
        "https://www.google.com",
      ) ?? undefined;
    const thumbnailUrl =
      toAbsoluteUrl(img.attr("data-src") ?? img.attr("src"), "https://www.google.com") ??
      imageUrl;

    const finalImageUrl = imageUrl ?? dataImageUrl;

    if (
      !finalImageUrl ||
      !thumbnailUrl ||
      !sourceUrl ||
      isGoogleThumbnailUrl(finalImageUrl) ||
      (isGoogleOwnedUrl(sourceUrl) && sourceUrl !== finalImageUrl)
    ) {
      return;
    }

    results.push({
      engine,
      type: "image",
      title:
        normalizeWhitespace(img.attr("alt")) ||
        normalizeWhitespace(link.attr("aria-label")) ||
        displayUrl(sourceUrl),
      snippet: "",
      url: sourceUrl,
      displayUrl: displayUrl(sourceUrl),
      imageUrl: finalImageUrl,
      thumbnailUrl,
      sourceUrl,
    });
  });

  collectGoogleImagesFromScript($, results);

  if (results.length === 0) {
    $("a[href] img").each((_, element) => {
      const image = $(element);
      const link = image.closest("a[href]");
      const href = link.attr("href");
      const extracted = extractGoogleImageFromHref(href);
      const imageUrl =
        extracted.imageUrl ??
        toAbsoluteUrl(
          image.attr("data-iurl") ??
            image.attr("data-ou") ??
            image.attr("data-src") ??
            image.attr("src"),
          "https://www.google.com",
        );
      const sourceUrl =
        extracted.sourceUrl ??
        cleanGoogleUrl(href) ??
        toAbsoluteUrl(href, "https://www.google.com") ??
        imageUrl;

      if (
        !isLikelyHttpImageUrl(imageUrl) ||
        !sourceUrl ||
        isGoogleThumbnailUrl(imageUrl) ||
        isGoogleOwnedUrl(sourceUrl)
      ) {
        return;
      }

      results.push({
        engine,
        type: "image",
        title: normalizeWhitespace(image.attr("alt")) || displayUrl(imageUrl),
        snippet: "",
        url: sourceUrl,
        displayUrl: displayUrl(sourceUrl),
        imageUrl,
        thumbnailUrl: imageUrl,
        sourceUrl,
      });
    });
  }

  return dedupeResults(results) as ImageSearchResult[];
}

function extractGoogleImageFromHref(href: string | undefined) {
  const link = toAbsoluteUrl(href, "https://www.google.com");
  if (!link) {
    return {
      imageUrl: null as string | null,
      sourceUrl: null as string | null,
    };
  }

  try {
    const parsed = new URL(link);
    const imageUrl = toAbsoluteUrl(parsed.searchParams.get("imgurl") ?? undefined, link);
    const sourceUrl =
      toAbsoluteUrl(parsed.searchParams.get("imgrefurl") ?? undefined, link) ??
      cleanGoogleUrl(parsed.searchParams.get("imgrefurl") ?? undefined);
    return { imageUrl, sourceUrl };
  } catch {
    return {
      imageUrl: null as string | null,
      sourceUrl: null as string | null,
    };
  }
}

function collectGoogleImagesFromScript(
  $: cheerio.CheerioAPI,
  results: ImageSearchResult[],
) {
  const baseUrl = "https://www.google.com";
  const imageKeys = ["ou", "imgurl", "murl", "imageUrl", "fullImageUrl"];
  const sourceKeys = ["ru", "imgrefurl", "sourceUrl", "pageUrl", "purl"];
  const thumbKeys = ["tu", "thumbnailUrl", "turl", "thumb"];
  const titleKeys = ["pt", "title", "alt"];

  $("script").each((_, element) => {
    const raw = $(element).html();
    if (!raw || raw.length < 40) {
      return;
    }

    const chunks = raw.match(/\{[^{}]{0,6000}\}/g) ?? [raw];
    for (const chunk of chunks) {
      const imageCandidate = firstScriptValueForKeys(chunk, imageKeys);
      if (!imageCandidate) {
        continue;
      }

      const imageUrl = toAbsoluteUrl(decodeScriptEscapes(imageCandidate), baseUrl);
      if (!imageUrl || isGoogleThumbnailUrl(imageUrl)) {
        continue;
      }

      const sourceCandidate = firstScriptValueForKeys(chunk, sourceKeys);
      const sourceUrl =
        toAbsoluteUrl(
          sourceCandidate ? decodeScriptEscapes(sourceCandidate) : undefined,
          baseUrl,
        ) ?? imageUrl;
      if (isGoogleOwnedUrl(sourceUrl) && sourceUrl !== imageUrl) {
        continue;
      }

      const thumbCandidate = firstScriptValueForKeys(chunk, thumbKeys);
      const thumbnailUrl =
        toAbsoluteUrl(
          thumbCandidate ? decodeScriptEscapes(thumbCandidate) : undefined,
          baseUrl,
        ) ?? imageUrl;
      const title =
        normalizeWhitespace(firstScriptValueForKeys(chunk, titleKeys)) ||
        displayUrl(sourceUrl);

      results.push({
        engine,
        type: "image",
        title,
        snippet: "",
        url: sourceUrl,
        displayUrl: displayUrl(sourceUrl),
        imageUrl,
        thumbnailUrl,
        sourceUrl,
      });
    }
  });
}

function firstScriptValueForKeys(chunk: string, keys: string[]) {
  for (const key of keys) {
    const regex = new RegExp(
      `['"]?${escapeRegex(key)}['"]?\\s*:\\s*['"]([^'"]+)['"]`,
      "i",
    );
    const match = chunk.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}

function decodeScriptEscapes(value: string) {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u002f/g, "/")
    .replace(/\\u003a/g, ":")
    .replace(/\\u0025/g, "%")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .trim();
}

function isGoogleThumbnailUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (host === "encrypted-tbn0.gstatic.com" || host.endsWith(".gstatic.com")) {
      return true;
    }

    if (host.endsWith("google.com") && path.includes("/images/branding/")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function isGoogleOwnedUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.endsWith("google.com") || host.endsWith(".google.com");
  } catch {
    return false;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
