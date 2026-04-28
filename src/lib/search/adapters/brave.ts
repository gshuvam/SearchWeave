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
import {
  cleanBraveUrl,
  displayUrl,
  isLikelyHttpImageUrl,
  normalizeWhitespace,
  toAbsoluteUrl,
} from "../url";

const engine = "brave" as const;

export const braveAdapter: SearchAdapter = {
  engine,
  searchText,
  searchImages,
};

async function searchText(context: ScrapeContext): Promise<AdapterSearchResponse> {
  const results: TextSearchResult[] = [];
  const warnings = [];
  let offset = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(
      context.query,
    )}&offset=${offset}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseBraveText(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      offset += 10;
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
  let offset = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://search.brave.com/images?q=${encodeURIComponent(
      context.query,
    )}&offset=${offset}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseBraveImages(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
        break;
      }
      offset += 20;
    } catch (error) {
      warnings.push(warningFromError(engine, error));
      break;
    }
  }

  return { results, warnings };
}

export function parseBraveText(html: string): TextSearchResult[] {
  const $ = cheerio.load(html);
  const results: TextSearchResult[] = [];
  const selectors = [
    '[data-testid="web-result"]',
    ".web-result",
    ".snippet",
    ".result",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const result = $(element);
      const link = result.find("a[href]").first();
      const url = cleanBraveUrl(link.attr("href"));
      const title =
        normalizeWhitespace(
          result
            .find("h2, h3, .heading-serpresult, .snippet-title, .title")
            .first()
            .text(),
        ) || normalizeWhitespace(link.text());

      if (!url || !title) {
        return;
      }

      results.push({
        engine,
        type: "text",
        title,
        snippet: normalizeWhitespace(
          result
            .find(".snippet-description, .description, .snippet-content, p")
            .first()
            .text(),
        ),
        url,
        displayUrl: displayUrl(url),
      });
    });

    if (results.length > 0) {
      break;
    }
  }

  return dedupeResults(results) as TextSearchResult[];
}

export function parseBraveImages(html: string): ImageSearchResult[] {
  const $ = cheerio.load(html);
  const results: ImageSearchResult[] = [];

  $("script[type='application/json'], script#__NEXT_DATA__").each((_, element) => {
    const raw = normalizeWhitespace($(element).text());
    if (!raw) {
      return;
    }

    try {
      collectBraveImageObjects(JSON.parse(raw), results);
    } catch {
      return;
    }
  });

  $(".image-result, [data-testid='image-result'], a[href] img").each((_, element) => {
    const image = $(element).is("img") ? $(element) : $(element).find("img").first();
    const parentLink = image.closest("a[href]");
    const imageUrl = toAbsoluteUrl(
      image.attr("data-src") ?? image.attr("src"),
      "https://search.brave.com",
    );
    const sourceUrl =
      toAbsoluteUrl(parentLink.attr("href"), "https://search.brave.com") ?? imageUrl;

    if (!isLikelyHttpImageUrl(imageUrl) || !sourceUrl) {
      return;
    }

    results.push({
      engine,
      type: "image",
      title: normalizeWhitespace(image.attr("alt")) || displayUrl(sourceUrl),
      snippet: "",
      url: sourceUrl,
      displayUrl: displayUrl(sourceUrl),
      imageUrl,
      thumbnailUrl: imageUrl,
      sourceUrl,
    });
  });

  return dedupeResults(results) as ImageSearchResult[];
}

function collectBraveImageObjects(value: unknown, results: ImageSearchResult[]) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBraveImageObjects(item, results);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const imageUrl = firstString(record, ["image", "imageUrl", "src", "url"]);
  const thumbnailUrl = firstString(record, ["thumbnail", "thumbnailUrl", "thumb"]);
  const sourceUrl = firstString(record, ["sourceUrl", "pageUrl", "source", "page"]);

  if (isLikelyHttpImageUrl(imageUrl)) {
    const finalSourceUrl =
      toAbsoluteUrl(sourceUrl, "https://search.brave.com") ?? imageUrl;
    results.push({
      engine,
      type: "image",
      title:
        normalizeWhitespace(firstString(record, ["title", "alt", "description"])) ||
        displayUrl(finalSourceUrl),
      snippet: normalizeWhitespace(firstString(record, ["description", "source"])),
      url: finalSourceUrl,
      displayUrl: displayUrl(finalSourceUrl),
      imageUrl,
      thumbnailUrl:
        toAbsoluteUrl(thumbnailUrl, "https://search.brave.com") ?? imageUrl,
      sourceUrl: finalSourceUrl,
    });
  }

  for (const nested of Object.values(record)) {
    collectBraveImageObjects(nested, results);
  }
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}
