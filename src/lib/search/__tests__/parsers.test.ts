import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBingImages, parseBingText } from "../adapters/bing";
import { parseBraveImages, parseBraveText } from "../adapters/brave";
import {
  parseDuckDuckGoTextNextRequest,
  parseDuckDuckGoImages,
  parseDuckDuckGoText,
} from "../adapters/duckduckgo";
import { parseGoogleImages, parseGoogleText } from "../adapters/google";

const fixtures = path.join(__dirname, "..", "__fixtures__");

function fixture(name: string) {
  return readFileSync(path.join(fixtures, name), "utf8");
}

describe("search parsers", () => {
  it("parses DuckDuckGo text results", () => {
    const [result] = parseDuckDuckGoText(fixture("duckduckgo-text.html"));
    expect(result).toMatchObject({
      engine: "duckduckgo",
      title: "Duck Result",
      url: "https://example.com/duck",
    });
  });

  it("parses DuckDuckGo lite text results", () => {
    const [result] = parseDuckDuckGoText(fixture("duckduckgo-lite-text.html"));
    expect(result).toMatchObject({
      engine: "duckduckgo",
      title: "Lite Result One",
      url: "https://example.com/lite-1",
      displayUrl: "example.com/lite-1",
    });
  });

  it("parses DuckDuckGo next-page form fields", () => {
    const request = parseDuckDuckGoTextNextRequest(
      fixture("duckduckgo-text-with-next.html"),
    );

    expect(request).toMatchObject({
      method: "POST",
      url: "https://html.duckduckgo.com/html/",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(request?.body).toContain("q=bird+images");
    expect(request?.body).toContain("s=10");
    expect(request?.body).toContain("dc=11");
    expect(request?.body).toContain("vqd=4-test-vqd");
  });

  it("parses DuckDuckGo lite next-page form fields", () => {
    const request = parseDuckDuckGoTextNextRequest(
      fixture("duckduckgo-lite-text.html"),
    );

    expect(request).toMatchObject({
      method: "POST",
      url: "https://lite.duckduckgo.com/lite/",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(request?.body).toContain("s=25");
    expect(request?.body).toContain("dc=26");
    expect(request?.body).toContain("vqd=4-lite-vqd");
  });

  it("parses DuckDuckGo image results", () => {
    const [result] = parseDuckDuckGoImages(fixture("duckduckgo-images.json"));
    expect(result).toMatchObject({
      engine: "duckduckgo",
      title: "Duck Image",
      imageUrl: "https://images.example.com/duck.jpg",
    });
  });

  it("parses Bing text results", () => {
    const [result] = parseBingText(fixture("bing-text.html"));
    expect(result).toMatchObject({
      engine: "bing",
      title: "Bing Result",
      url: "https://example.com/bing",
    });
  });

  it("parses Bing image results", () => {
    const [result] = parseBingImages(fixture("bing-images.html"));
    expect(result).toMatchObject({
      engine: "bing",
      title: "Bing Image",
      imageUrl: "https://images.example.com/bing.jpg",
    });
  });

  it("parses Google text results", () => {
    const [result] = parseGoogleText(fixture("google-text.html"));
    expect(result).toMatchObject({
      engine: "google",
      title: "Google Result",
      url: "https://example.com/google",
    });
  });

  it("parses Google image results", () => {
    const [result] = parseGoogleImages(fixture("google-images.html"));
    expect(result).toMatchObject({
      engine: "google",
      title: "Google Image",
      imageUrl: "https://images.example.com/google.jpg",
    });
  });

  it("ignores Google thumbnail-only fallback images", () => {
    const results = parseGoogleImages(`
      <html>
        <body>
          <img src="https://www.google.com/images/branding/searchlogo/1x/googlelogo_hp_white_color_269x95dp.png" />
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:abc123" />
        </body>
      </html>
    `);

    expect(results).toHaveLength(0);
  });

  it("parses Brave text results", () => {
    const [result] = parseBraveText(fixture("brave-text.html"));
    expect(result).toMatchObject({
      engine: "brave",
      title: "Brave Result",
      url: "https://example.com/brave",
    });
  });

  it("parses Brave image results", () => {
    const [result] = parseBraveImages(fixture("brave-images.html"));
    expect(result).toMatchObject({
      engine: "brave",
      title: "Brave Image",
      imageUrl: "https://images.example.com/brave.jpg",
    });
  });
});
