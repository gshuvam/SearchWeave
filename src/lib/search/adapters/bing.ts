import * as cheerio from "cheerio";
import { dedupeResults, mergeUnique } from "../dedupe";
import { fetchText, hasTimeRemaining, warningFromError } from "../fetcher";
import type {
  AdapterSearchResponse,
  ImageSearchResult,
  ScrapeContext,
  SearchAdapter,
  TextSearchResult,
} from "../types";
import { cleanBingUrl, displayUrl, normalizeWhitespace, toAbsoluteUrl } from "../url";

const engine = "bing" as const;

export const bingAdapter: SearchAdapter = {
  engine,
  searchText,
  searchImages,
};

async function searchText(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: TextSearchResult[] = [];
  const warnings = [];
  let first = 1;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(
      context.query,
    )}&first=${first}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseBingText(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      first += 10;
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }
  }

  return { results, warnings };
}

async function searchImages(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: ImageSearchResult[] = [];
  const warnings = [];
  let first = 1;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(
      context.query,
    )}&first=${first}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseBingImages(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      first += 20;
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }
  }

  return { results, warnings };
}

export function parseBingText(html: string): TextSearchResult[] {
  const $ = cheerio.load(html);
  const results: TextSearchResult[] = [];

  $("li.b_algo").each((_, element) => {
    const result = $(element);
    const link = result.find("h2 a").first();
    const url = cleanBingUrl(link.attr("href"));
    const title = normalizeWhitespace(link.text());

    if (!url || !title) {
      return;
    }

    results.push({
      engine,
      type: "text",
      title,
      snippet: normalizeWhitespace(result.find(".b_caption p").first().text()),
      url,
      displayUrl: displayUrl(url),
    });
  });

  return dedupeResults(results) as TextSearchResult[];
}

export function parseBingImages(html: string): ImageSearchResult[] {
  const $ = cheerio.load(html);
  const results: ImageSearchResult[] = [];

  $("a.iusc").each((_, element) => {
    const link = $(element);
    const meta = parseBingImageMetadata(link.attr("m"));
    const imageUrl = toAbsoluteUrl(meta?.murl, "https://www.bing.com");
    const thumbnailUrl =
      toAbsoluteUrl(meta?.turl, "https://www.bing.com") ?? imageUrl;
    const sourceUrl =
      toAbsoluteUrl(meta?.purl, "https://www.bing.com") ??
      toAbsoluteUrl(link.attr("href"), "https://www.bing.com") ??
      imageUrl;

    if (!imageUrl || !thumbnailUrl || !sourceUrl) {
      return;
    }

    results.push({
      engine,
      type: "image",
      title:
        normalizeWhitespace(meta?.t) ||
        normalizeWhitespace(link.attr("aria-label")) ||
        displayUrl(sourceUrl),
      snippet: "",
      url: sourceUrl,
      displayUrl: displayUrl(sourceUrl),
      imageUrl,
      thumbnailUrl,
      sourceUrl,
    });
  });

  return dedupeResults(results) as ImageSearchResult[];
}

function parseBingImageMetadata(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as {
      murl?: string;
      turl?: string;
      purl?: string;
      t?: string;
    };
  } catch {
    return null;
  }
}
