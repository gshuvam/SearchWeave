import { describe, expect, it } from "vitest";
import { dedupeResults } from "../dedupe";
import type { SearchResult } from "../types";
import { SearchApiError } from "../types";
import { parseEngines, parseSearchRequest } from "../validation";

describe("search request validation", () => {
  it("applies the default type and limit", () => {
    const parsed = parseSearchRequest(
      new URLSearchParams("q=alpha&engine=duckduckgo,bing"),
      50,
    );

    expect(parsed).toEqual({
      query: "alpha",
      type: "text",
      engines: ["duckduckgo", "bing"],
      limit: 50,
    });
  });

  it("deduplicates engines while preserving order", () => {
    expect(parseEngines("bing,duckduckgo,bing")).toEqual(["bing", "duckduckgo"]);
  });

  it("parses google_cookie when provided", () => {
    const parsed = parseSearchRequest(
      new URLSearchParams(
        "q=alpha&engine=google&google_cookie=NID%3Dabc%3B%201P_JAR%3Dxyz",
      ),
      50,
    );

    expect(parsed.googleCookie).toBe("NID=abc; 1P_JAR=xyz");
  });

  it("rejects invalid limits", () => {
    expect(() =>
      parseSearchRequest(new URLSearchParams("q=alpha&engine=bing&limit=0"), 50),
    ).toThrow(SearchApiError);
  });
});

describe("result dedupe", () => {
  it("deduplicates by canonical result URL", () => {
    const results: SearchResult[] = [
      {
        engine: "bing",
        type: "text",
        title: "One",
        snippet: "",
        url: "https://example.com/path?utm_source=test#section",
        displayUrl: "example.com/path",
      },
      {
        engine: "google",
        type: "text",
        title: "Duplicate",
        snippet: "",
        url: "https://example.com/path",
        displayUrl: "example.com/path",
      },
    ];

    expect(dedupeResults(results)).toHaveLength(1);
  });
});
