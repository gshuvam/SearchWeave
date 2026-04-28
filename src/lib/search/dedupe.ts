import type { SearchResult } from "./types";
import { canonicalUrl } from "./url";

export function dedupeResults(results: SearchResult[], limit?: number) {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];

  for (const result of results) {
    const key =
      result.type === "image"
        ? `image:${canonicalUrl(result.imageUrl || result.url)}`
        : `text:${canonicalUrl(result.url)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(result);

    if (limit && unique.length >= limit) {
      break;
    }
  }

  return unique;
}

export function mergeUnique(
  target: SearchResult[],
  incoming: SearchResult[],
  limit: number,
) {
  const before = target.length;
  const merged = dedupeResults([...target, ...incoming], limit);
  target.splice(0, target.length, ...merged);
  return target.length - before;
}
