const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
];

export function normalizeWhitespace(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function toAbsoluteUrl(
  value: string | undefined,
  baseUrl: string,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

export function cleanDuckDuckGoUrl(value: string | undefined): string | null {
  const url = toAbsoluteUrl(value, "https://duckduckgo.com");
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? toAbsoluteUrl(uddg, "https://duckduckgo.com") : url;
  } catch {
    return url;
  }
}

export function cleanGoogleUrl(value: string | undefined): string | null {
  const url = toAbsoluteUrl(value, "https://www.google.com");
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("google.com") && parsed.pathname === "/url") {
      return toAbsoluteUrl(parsed.searchParams.get("q") ?? undefined, url);
    }

    if (parsed.hostname.endsWith("google.com")) {
      return null;
    }

    return url;
  } catch {
    return url;
  }
}

export function cleanBingUrl(value: string | undefined): string | null {
  const url = toAbsoluteUrl(value, "https://www.bing.com");
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const encodedDestination = parsed.searchParams.get("u");

    if (parsed.hostname.endsWith("bing.com") && encodedDestination) {
      return decodeBingDestination(encodedDestination) ?? url;
    }

    return url;
  } catch {
    return url;
  }
}

export function cleanBraveUrl(value: string | undefined): string | null {
  const url = toAbsoluteUrl(value, "https://search.brave.com");
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "search.brave.com") {
      return null;
    }

    return url;
  } catch {
    return url;
  }
}

function decodeBingDestination(value: string) {
  const encoded = value.startsWith("a1") ? value.slice(2) : value;
  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");

  try {
    return toAbsoluteUrl(
      Buffer.from(padded, "base64").toString("utf8"),
      "https://www.bing.com",
    );
  } catch {
    return null;
  }
}

export function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";

    for (const param of Array.from(url.searchParams.keys())) {
      if (param.startsWith("utm_") || TRACKING_PARAMS.includes(param)) {
        url.searchParams.delete(param);
      }
    }

    const params = Array.from(url.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    url.search = "";
    for (const [key, paramValue] of params) {
      url.searchParams.append(key, paramValue);
    }

    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export function isLikelyHttpImageUrl(
  value: string | null | undefined,
): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
