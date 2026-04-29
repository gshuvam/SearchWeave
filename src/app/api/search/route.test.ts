import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const bingHtml = `
  <li class="b_algo">
    <h2><a href="https://example.com/shared">Shared Result</a></h2>
    <div class="b_caption"><p>Bing result snippet.</p></div>
  </li>
`;

const googleHtml = `
  <div class="g">
    <a href="/url?q=https%3A%2F%2Fexample.com%2Fshared"><h3>Shared Result</h3></a>
    <div class="VwiC3b">Google result snippet.</div>
  </div>
`;

const duckPageOneHtml = `
  <div class="result">
    <h2><a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fduck-1">Duck 1</a></h2>
    <a class="result__snippet">Duck snippet 1.</a>
  </div>
  <div class="nav-link">
    <form action="/html/" method="post">
      <input type="submit" value="Next" />
      <input type="hidden" name="q" value="birds" />
      <input type="hidden" name="s" value="10" />
      <input type="hidden" name="nextParams" value="" />
      <input type="hidden" name="v" value="l" />
      <input type="hidden" name="o" value="json" />
      <input type="hidden" name="dc" value="11" />
      <input type="hidden" name="api" value="d.js" />
      <input type="hidden" name="vqd" value="4-test" />
    </form>
  </div>
`;

const duckPageTwoHtml = `
  <div class="result">
    <h2><a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fduck-2">Duck 2</a></h2>
    <a class="result__snippet">Duck snippet 2.</a>
  </div>
`;

function request(path: string, apiKey = "test-key") {
  return new Request(`http://localhost${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.stubEnv("SEARCH_API_KEY", "test-key");
    vi.stubEnv("SEARCH_DEFAULT_LIMIT", "50");
    vi.stubEnv("SEARCH_REQUEST_TIMEOUT_MS", "25000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects missing API keys", async () => {
    const response = await GET(new Request("http://localhost/api/search?q=x&engine=bing"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });

  it("allows localhost requests without API key when SEARCH_ALLOW_LOCAL_NO_AUTH=true", async () => {
    vi.stubEnv("SEARCH_API_KEY", "");
    vi.stubEnv("SEARCH_ALLOW_LOCAL_NO_AUTH", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bingHtml, { status: 200 })),
    );

    const response = await GET(
      new Request("http://localhost/api/search?q=alpha&engine=bing"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
  });

  it("still rejects non-localhost requests without API key", async () => {
    vi.stubEnv("SEARCH_API_KEY", "");
    vi.stubEnv("SEARCH_ALLOW_LOCAL_NO_AUTH", "true");

    const response = await GET(
      new Request("https://api.example.com/api/search?q=alpha&engine=bing"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });

  it("uses the default limit and returns JSON results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bingHtml, { status: 200 })),
    );

    const response = await GET(request("/api/search?q=alpha&engine=bing"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestedLimit).toBe(50);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].engine).toBe("bing");
  });

  it("runs multiple engines and deduplicates matching results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input.toString();
        return new Response(url.includes("google") ? googleHtml : bingHtml, {
          status: 200,
        });
      }),
    );

    const response = await GET(
      request("/api/search?q=alpha&engine=bing,google&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.engines).toEqual(["bing", "google"]);
  });

  it("follows DuckDuckGo next-page form fields to fill the requested limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(duckPageOneHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(duckPageTwoHtml, { status: 200 })),
    );

    const response = await GET(
      request("/api/search?q=birds&engine=duckduckgo&limit=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.returned).toBe(2);
    expect(body.results[0].url).toBe("https://example.com/duck-1");
    expect(body.results[1].url).toBe("https://example.com/duck-2");
  });

  it("returns engine warnings for blocked sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("blocked", { status: 429 })),
    );

    const response = await GET(request("/api/search?q=alpha&engine=bing&limit=10"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(0);
    expect(body.errors[0]).toMatchObject({
      engine: "bing",
      code: "blocked",
      status: 429,
    });
    expect(body.warnings).toEqual([]);
  });

  it("returns timeout warnings without failing the whole request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }),
    );

    const response = await GET(request("/api/search?q=alpha&engine=bing&limit=10"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors[0]).toMatchObject({
      engine: "bing",
      code: "timeout",
    });
    expect(body.warnings).toEqual([]);
  });

  it("returns parse errors when Google image markup cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body>unexpected markup</body></html>")),
    );

    const response = await GET(
      request("/api/search?q=mount+everest&type=image&engine=google&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(0);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          engine: "google",
          code: "parse_error",
        }),
      ]),
    );
    expect(body.warnings).toEqual([]);
  });

  it("returns blocked errors when Google serves a challenge page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `
              <html>
                <body>
                  <div>If you're having trouble accessing Google Search, please click here.</div>
                  <a href="/search?q=mount+everest&emsg=SG_REL">retry</a>
                </body>
              </html>
            `,
          ),
      ),
    );

    const response = await GET(
      request("/api/search?q=mount+everest&type=image&engine=google&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(0);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          engine: "google",
          code: "blocked",
        }),
      ]),
    );
    expect(body.captcha_required).toBe(true);
    expect(body.captchaUrl).toMatch(/^https:\/\/www\.google\.com\//);
    expect(body.warnings).toEqual([]);
  });

  it("returns partial_results warning for partial successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bingHtml, { status: 200 })),
    );

    const response = await GET(request("/api/search?q=alpha&engine=bing&limit=10"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.returned).toBe(1);
    expect(body.errors).toEqual([]);
    expect(body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "partial_results",
        }),
      ]),
    );
  });
});
