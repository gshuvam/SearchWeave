import { afterEach, describe, expect, it } from "vitest";
import {
  SearchWeaveClient,
  SearchWeaveConfigError,
  SearchWeaveRequestError,
  createAuthHeaders,
  resolveClientConfig,
  saveConfigFile,
} from "./index.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

const originalBaseUrl = process.env.SEARCH_API_BASE_URL;
const originalApiKey = process.env.SEARCH_API_KEY;

afterEach(() => {
  if (originalBaseUrl === undefined) {
    delete process.env.SEARCH_API_BASE_URL;
  } else {
    process.env.SEARCH_API_BASE_URL = originalBaseUrl;
  }

  if (originalApiKey === undefined) {
    delete process.env.SEARCH_API_KEY;
  } else {
    process.env.SEARCH_API_KEY = originalApiKey;
  }
});

describe("@searchweave/client config precedence", () => {
  it("prefers explicit args over env over config file over defaults", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "sw-client-"));
    const configPath = path.join(tempDir, "config.json");

    saveConfigFile(
      {
        baseUrl: "http://from-file:3000",
        apiKey: "from-file",
      },
      configPath,
    );

    process.env.SEARCH_API_BASE_URL = "http://from-env:3000";
    process.env.SEARCH_API_KEY = "from-env";

    const resolved = resolveClientConfig({
      configPath,
      baseUrl: "http://from-arg:3000",
      apiKey: "from-arg",
    });

    expect(resolved.baseUrl).toBe("http://from-arg:3000");
    expect(resolved.apiKey).toBe("from-arg");
  });

  it("falls back to env when explicit args are absent", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "sw-client-"));
    const configPath = path.join(tempDir, "config.json");

    process.env.SEARCH_API_BASE_URL = "http://from-env:3000";
    process.env.SEARCH_API_KEY = "from-env";

    const resolved = resolveClientConfig({ configPath });

    expect(resolved.baseUrl).toBe("http://from-env:3000");
    expect(resolved.apiKey).toBe("from-env");
  });
});

describe("@searchweave/client auth header behavior", () => {
  it("omits authorization for localhost when key is blank", () => {
    expect(createAuthHeaders("http://127.0.0.1:3000", "")).toEqual({});
    expect(createAuthHeaders("http://localhost:3000", "")).toEqual({});
  });

  it("requires api key for non-localhost targets", () => {
    expect(() => createAuthHeaders("https://api.example.com", "")).toThrow(
      SearchWeaveConfigError,
    );
  });
});

describe("@searchweave/client error mapping", () => {
  it("throws SearchWeaveRequestError for non-2xx responses", async () => {
    const client = new SearchWeaveClient({
      baseUrl: "https://api.example.com",
      apiKey: "abc",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Denied",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(
      client.search({ q: "vercel", engine: "bing" }),
    ).rejects.toBeInstanceOf(SearchWeaveRequestError);
  });
});
