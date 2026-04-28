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
  const warnings = [];
  let start = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(
      context.query,
    )}&num=10&hl=en&start=${start}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseGoogleText(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
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
  const warnings = [];
  let start = 0;

  while (results.length < context.limit && hasTimeRemaining(context.deadline)) {
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
      context.query,
    )}&hl=en&start=${start}`;

    try {
      const html = await fetchText(url, { ...context, engine });
      const parsed = parseGoogleImages(html);
      if (parsed.length === 0 || mergeUnique(results, parsed, context.limit) === 0) {
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

  $("a[href*='/imgres']").each((_, element) => {
    const link = $(element);
    const href = toAbsoluteUrl(link.attr("href"), "https://www.google.com");
    if (!href) {
      return;
    }

    const parsed = new URL(href);
    const imageUrl = toAbsoluteUrl(
      parsed.searchParams.get("imgurl") ?? undefined,
      href,
    );
    const sourceUrl =
      toAbsoluteUrl(parsed.searchParams.get("imgrefurl") ?? undefined, href) ??
      href;
    const img = link.find("img").first();
    const thumbnailUrl =
      toAbsoluteUrl(img.attr("data-src") ?? img.attr("src"), "https://www.google.com") ??
      imageUrl;

    if (!imageUrl || !thumbnailUrl || !sourceUrl) {
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
      imageUrl,
      thumbnailUrl,
      sourceUrl,
    });
  });

  if (results.length === 0) {
    $("img").each((_, element) => {
      const image = $(element);
      const imageUrl = toAbsoluteUrl(
        image.attr("data-src") ?? image.attr("src"),
        "https://www.google.com",
      );

      if (!isLikelyHttpImageUrl(imageUrl)) {
        return;
      }

      results.push({
        engine,
        type: "image",
        title: normalizeWhitespace(image.attr("alt")) || displayUrl(imageUrl),
        snippet: "",
        url: imageUrl,
        displayUrl: displayUrl(imageUrl),
        imageUrl,
        thumbnailUrl: imageUrl,
        sourceUrl: imageUrl,
      });
    });
  }

  return dedupeResults(results) as ImageSearchResult[];
}
