import * as cheerio from "cheerio";
import { dedupeResults, mergeUnique } from "../dedupe";
import { fetchText, hasTimeRemaining, warningFromError } from "../fetcher";
import type {
  AdapterSearchResponse,
  ImageSearchResult,
  ScrapeContext,
  SearchAdapter,
  SearchWarning,
  TextSearchResult,
} from "../types";
import {
  cleanDuckDuckGoUrl,
  displayUrl,
  normalizeWhitespace,
  toAbsoluteUrl,
} from "../url";

const engine = "duckduckgo" as const;
const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const DUCKDUCKGO_LITE_URL = "https://lite.duckduckgo.com/lite/";

export const duckDuckGoAdapter: SearchAdapter = {
  engine,
  searchText,
  searchImages,
};

async function searchText(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: TextSearchResult[] = [];
  const warnings = [];
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (results.length >= context.limit || !hasTimeRemaining(context.deadline)) {
      break;
    }

    try {
      const attemptResponse = await crawlDuckDuckGoTextAttempt(
        context,
        `${DUCKDUCKGO_LITE_URL}?q=${encodeURIComponent(context.query)}`,
        DUCKDUCKGO_LITE_URL,
      );
      mergeUnique(results, attemptResponse.results, context.limit);
      warnings.push(...attemptResponse.warnings);

      if (attemptResponse.results.length === 0) {
        break;
      }
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }

    if (results.length < context.limit && attempt < maxAttempts) {
      await sleep(200);
    }
  }

  // Rescue path for occasional zero-result lite responses:
  // retry once against the html endpoint before returning empty.
  if (results.length === 0 && hasTimeRemaining(context.deadline)) {
    try {
      const fallbackResponse = await crawlDuckDuckGoTextAttempt(
        context,
        `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(context.query)}`,
        DUCKDUCKGO_HTML_URL,
      );
      mergeUnique(results, fallbackResponse.results, context.limit);
      warnings.push(...fallbackResponse.warnings);
    } catch (error) {
      warnings.push(warningFromError(engine, error));
    }
  }

  return { results, warnings };
}

async function crawlDuckDuckGoTextAttempt(
  context: ScrapeContext,
  startUrl: string,
  referer: string,
): Promise<AdapterSearchResponse> {
  const results: TextSearchResult[] = [];
  const warnings: SearchWarning[] = [];
  const seenPageRequests = new Set<string>();
  const cookieJar = new Map<string, string>();
  let nextRequest: DuckDuckGoTextPageRequest | null = {
    method: "GET",
    url: startUrl,
  };

  while (
    nextRequest &&
    results.length < context.limit &&
    hasTimeRemaining(context.deadline)
  ) {
    const pageRequestSignature = `${nextRequest.method}:${nextRequest.url}:${
      nextRequest.body ?? ""
    }`;
    if (seenPageRequests.has(pageRequestSignature)) {
      break;
    }
    seenPageRequests.add(pageRequestSignature);

    const html = await fetchText(nextRequest.url, {
      ...context,
      engine,
      method: nextRequest.method,
      body: nextRequest.body,
      contentType: nextRequest.contentType,
      referer,
      cookie: serializeCookieJar(cookieJar),
      onSetCookies: (cookies) => applySetCookies(cookieJar, cookies),
    });
    const parsed = parseDuckDuckGoText(html);
    if (parsed.length === 0) {
      break;
    }
    mergeUnique(results, parsed, context.limit);

    nextRequest = parseDuckDuckGoTextNextRequest(html);
  }

  return { results, warnings };
}

function applySetCookies(
  cookieJar: Map<string, string>,
  cookieHeaders: string[],
) {
  for (const cookieHeader of cookieHeaders) {
    const firstSegment = cookieHeader.split(";")[0]?.trim();
    if (!firstSegment) {
      continue;
    }

    const separatorIndex = firstSegment.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = firstSegment.slice(0, separatorIndex).trim();
    const value = firstSegment.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    cookieJar.set(key, value);
  }
}

function serializeCookieJar(cookieJar: Map<string, string>) {
  if (cookieJar.size === 0) {
    return undefined;
  }

  return Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function searchImages(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: ImageSearchResult[] = [];
  const warnings = [];

  try {
    const html = await fetchText(
      `https://duckduckgo.com/?q=${encodeURIComponent(
        context.query,
      )}&iax=images&ia=images`,
      { ...context, engine },
    );
    const vqd = extractDuckDuckGoVqd(html);

    if (!vqd) {
      return {
        results,
        warnings: [
          {
            engine,
            code: "parse_error",
            message: "DuckDuckGo image token was not found.",
          },
        ],
      };
    }

    let offset = 0;
    let nextUrl: string | null = null;

    while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
      const url =
        nextUrl ??
        `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
          context.query,
        )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1&s=${offset}`;

      const jsonText = await fetchText(url, { ...context, engine });
      const parsedResponse = JSON.parse(jsonText) as DuckDuckGoImageApiResponse;
      const parsed = parseDuckDuckGoImages(parsedResponse);

      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }

      nextUrl = parsedResponse.next
        ? toAbsoluteUrl(parsedResponse.next, "https://duckduckgo.com")
        : null;
      offset += parsed.length;

      if (!nextUrl && parsed.length === 0) {
        break;
      }
    }
  } catch (error) {
    warnings.push(warningFromError(engine, error));
  }

  return { results, warnings };
}

export function parseDuckDuckGoText(html: string): TextSearchResult[] {
  const $ = cheerio.load(html);
  const standardResults: TextSearchResult[] = [];

  $(".result").each((_, element) => {
    const result = $(element);
    const link = result.find(".result__a").first();
    const url = cleanDuckDuckGoUrl(link.attr("href"));
    const title = normalizeWhitespace(link.text());

    if (!url || !title) {
      return;
    }

    standardResults.push({
      engine,
      type: "text",
      title,
      snippet: normalizeWhitespace(result.find(".result__snippet").text()),
      url,
      displayUrl:
        normalizeWhitespace(result.find(".result__url").text()) || displayUrl(url),
    });
  });

  const liteResults = parseDuckDuckGoLiteText($);
  return dedupeResults([...standardResults, ...liteResults]) as TextSearchResult[];
}

export function parseDuckDuckGoTextNextRequest(
  html: string,
): DuckDuckGoTextPageRequest | null {
  const $ = cheerio.load(html);
  const nextForm = $("form.next_form").first();
  const navNextForm = $(".nav-link form")
    .filter((_, element) =>
      normalizeWhitespace($(element).find("input[type='submit']").attr("value"))
        .toLowerCase()
        .includes("next"),
    )
    .first();
  const form = nextForm.length > 0 ? nextForm : navNextForm;
  if (form.length === 0) {
    return null;
  }

  const actionBase =
    form.hasClass("next_form") || form.attr("action")?.includes("/lite")
      ? DUCKDUCKGO_LITE_URL
      : DUCKDUCKGO_HTML_URL;
  const actionUrl = toAbsoluteUrl(form.attr("action"), actionBase);
  if (!actionUrl) {
    return null;
  }

  const method = (form.attr("method") ?? "GET").toUpperCase();
  const params = new URLSearchParams();
  form.find("input[name]").each((_, element) => {
    const input = $(element);
    const type = (input.attr("type") ?? "").toLowerCase();
    if (type === "submit" || type === "button") {
      return;
    }

    const name = input.attr("name");
    if (!name) {
      return;
    }

    params.append(name, input.attr("value") ?? "");
  });

  const body = params.toString();
  if (!body) {
    return null;
  }

  if (method === "POST") {
    return {
      method: "POST",
      url: actionUrl,
      body,
      contentType: "application/x-www-form-urlencoded",
    };
  }

  const url = `${actionUrl}${actionUrl.includes("?") ? "&" : "?"}${body}`;
  return {
    method: "GET",
    url,
  };
}

function parseDuckDuckGoLiteText($: cheerio.CheerioAPI): TextSearchResult[] {
  const results: TextSearchResult[] = [];

  $("a.result-link").each((_, element) => {
    const link = $(element);
    const url = cleanDuckDuckGoUrl(link.attr("href"));
    const title = normalizeWhitespace(link.text());

    if (!url || !title) {
      return;
    }

    const containerRow = link.closest("tr");
    const followingRows = containerRow.nextAll("tr");
    let snippet = "";
    let shownUrl = "";

    followingRows.each((__, row) => {
      const currentRow = $(row);
      if (currentRow.find("a.result-link").length > 0) {
        return false;
      }

      if (!snippet) {
        snippet = normalizeWhitespace(currentRow.find(".result-snippet").text());
      }

      if (!shownUrl) {
        shownUrl = normalizeWhitespace(currentRow.find(".link-text").text());
      }

      return undefined;
    });

    results.push({
      engine,
      type: "text",
      title,
      snippet,
      url,
      displayUrl: shownUrl || displayUrl(url),
    });
  });

  return results;
}

export function parseDuckDuckGoImages(
  payload: DuckDuckGoImageApiResponse | string,
): ImageSearchResult[] {
  const data =
    typeof payload === "string"
      ? (JSON.parse(payload) as DuckDuckGoImageApiResponse)
      : payload;

  const results = (data.results ?? [])
    .map((item): ImageSearchResult | null => {
      const imageUrl = toAbsoluteUrl(item.image, "https://duckduckgo.com");
      const thumbnailUrl =
        toAbsoluteUrl(item.thumbnail, "https://duckduckgo.com") ?? imageUrl;
      const sourceUrl = toAbsoluteUrl(item.url, "https://duckduckgo.com") ?? imageUrl;

      if (!imageUrl || !thumbnailUrl || !sourceUrl) {
        return null;
      }

      return {
        engine,
        type: "image" as const,
        title: normalizeWhitespace(item.title) || displayUrl(sourceUrl),
        snippet: normalizeWhitespace(item.source),
        url: sourceUrl,
        displayUrl: displayUrl(sourceUrl),
        imageUrl,
        thumbnailUrl,
        sourceUrl,
      };
    })
    .filter((item): item is ImageSearchResult => item !== null);

  return dedupeResults(results) as ImageSearchResult[];
}

export function extractDuckDuckGoVqd(html: string) {
  return (
    html.match(/vqd=["']?([\w-]+)["']?/)?.[1] ??
    html.match(/vqd=([\w-]+)&/)?.[1] ??
    null
  );
}

type DuckDuckGoImageApiResponse = {
  next?: string;
  results?: Array<{
    image?: string;
    thumbnail?: string;
    title?: string;
    url?: string;
    source?: string;
  }>;
};

type DuckDuckGoTextPageRequest = {
  method: "GET" | "POST";
  url: string;
  body?: string;
  contentType?: string;
};
