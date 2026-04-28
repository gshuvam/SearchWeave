"use client";

import { FormEvent, useMemo, useState, useCallback, useRef, useEffect } from "react";

const TextIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
);

const ImageIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
);

const engines = [
  { id: "duckduckgo", label: "DuckDuckGo", icon: <img src="https://cdn.simpleicons.org/duckduckgo/DE5833" alt="DuckDuckGo" width={18} height={18} /> },
  { id: "bing", label: "Bing", icon: <img src="https://cdn.simpleicons.org/bigbluebutton/283274" alt="Bing" width={18} height={18} /> },
  { id: "google", label: "Google", icon: <img src="https://cdn.simpleicons.org/google/4285F4" alt="Google" width={18} height={18} /> },
  { id: "brave", label: "Brave", icon: <img src="https://cdn.simpleicons.org/brave/FF2000" alt="Brave" width={18} height={18} /> },
] as const;

type SearchType = "text" | "image";

/* ─── Syntax-highlighted JSON renderer ─── */
function SyntaxHighlightedJson({ json }: { json: string }) {
  const lines = json.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="json-line-number">{i + 1}</span>
          <span
            dangerouslySetInnerHTML={{ __html: colorizeLine(line) }}
          />
        </div>
      ))}
    </>
  );
}

function colorizeLine(line: string): string {
  return line
    // Keys (quoted before colon)
    .replace(
      /("(?:[^"\\]|\\.)*")\s*:/g,
      '<span class="json-key">$1</span><span class="json-colon">:</span>',
    )
    // String values (quoted, not keys)
    .replace(
      /:\s*("(?:[^"\\]|\\.)*")/g,
      (match, val) =>
        `: <span class="json-string">${val}</span>`,
    )
    // Standalone string values in arrays
    .replace(
      /^\s*("(?:[^"\\]|\\.)*")(,?)$/gm,
      (match, val, comma) => {
        if (match.includes("json-key")) return match;
        return `  <span class="json-string">${val}</span><span class="json-comma">${comma}</span>`;
      },
    )
    // Numbers
    .replace(
      /:\s*(-?\d+\.?\d*)/g,
      ': <span class="json-number">$1</span>',
    )
    // Booleans
    .replace(
      /:\s*(true|false)/g,
      ': <span class="json-boolean">$1</span>',
    )
    // Null
    .replace(
      /:\s*(null)/g,
      ': <span class="json-null">$1</span>',
    )
    // Brackets
    .replace(
      /([{}\[\]])/g,
      '<span class="json-bracket">$1</span>',
    );
}

/* ─── Status badge class helper ─── */
function getStatusClass(status: string | null): string {
  if (!status) return "";
  const code = parseInt(status);
  if (code >= 200 && code < 300) return "status-success";
  if (code >= 400 && code < 500) return "status-warning";
  return "status-error";
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */
export default function Home() {
  const [query, setQuery] = useState("west bengal");
  const [type, setType] = useState<SearchType>("text");
  const [selectedEngines, setSelectedEngines] = useState<string[]>([
    "duckduckgo",
  ]);
  const [limit, setLimit] = useState("50");
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const [responseJson, setResponseJson] = useState(
    JSON.stringify(
      {
        endpoint: "/api/search",
        method: "GET",
        authentication: "Bearer <SEARCH_API_KEY>",
        parameters: {
          q: "west bengal",
          type: "text",
          engine: "duckduckgo",
          limit: 50,
        },
        features: [
          "Multi-engine parallel crawling",
          "Normalized JSON output",
          "Text & image search",
          "Result deduplication",
          "Warning annotations",
        ],
      },
      null,
      2,
    ),
  );

  const engineValue = useMemo(
    () => selectedEngines.join(","),
    [selectedEngines],
  );
  const activeEngineCount = selectedEngines.length;

  const toggleEngine = useCallback((engine: string) => {
    setSelectedEngines((current) => {
      if (current.includes(engine)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== engine);
      }
      return [...current, engine];
    });
  }, []);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus(null);
    setElapsedMs(null);
    setResultCount(null);

    const params = new URLSearchParams({
      q: query,
      type,
      engine: engineValue,
    });

    if (limit.trim()) {
      params.set("limit", limit.trim());
    }

    try {
      const response = await fetch(`/api/search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const payload = await response.json();
      setStatus(`${response.status} ${response.statusText || "Response"}`);
      setElapsedMs(payload.elapsedMs ?? null);
      setResultCount(payload.returned ?? payload.results?.length ?? null);
      setResponseJson(JSON.stringify(payload, null, 2));
      setCopied(false);
    } catch (error) {
      setStatus("Request failed");
      setResponseJson(
        JSON.stringify(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to call /api/search",
          },
          null,
          2,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyResponseJson() {
    if (isCopying) return;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(responseJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } finally {
      setIsCopying(false);
    }
  }

  // Scroll to bottom of response on new results
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = 0;
    }
  }, [responseJson]);

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: "hsl(222 47% 5%)" }}>
      {/* ═══ Ambient Background Orbs ═══ */}
      <div className="ambient-orbs">
        <div
          className="ambient-orb animate-float"
          style={{
            width: 600,
            height: 600,
            top: "-10%",
            left: "-5%",
            background: "hsl(250 90% 65% / 0.12)",
          }}
        />
        <div
          className="ambient-orb animate-float-alt"
          style={{
            width: 500,
            height: 500,
            top: "40%",
            right: "-8%",
            background: "hsl(185 90% 55% / 0.1)",
          }}
        />
        <div
          className="ambient-orb"
          style={{
            width: 400,
            height: 400,
            bottom: "-5%",
            left: "30%",
            background: "hsl(270 80% 60% / 0.08)",
            animation: "float 14s ease-in-out infinite",
          }}
        />
      </div>

      {/* ═══ Content ═══ */}
      <div className="relative z-10 mx-auto flex w-full max-w-[94rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">

        {/* ═══════════════════════════════════════════
            HERO HEADER
        ═══════════════════════════════════════════ */}
        <header
          className="animate-fade-up relative overflow-hidden rounded-2xl border glass p-6 sm:p-8"
          style={{
            borderColor: "hsl(var(--accent-cyan) / 0.12)",
            boxShadow: "0 0 80px -30px hsl(185 90% 55% / 0.2), 0 20px 60px -20px rgba(0,0,0,0.4)",
            animationDelay: "0.05s",
          }}
        >
          {/* Decorative glow blobs */}
          <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "hsl(var(--accent-cyan) / 0.15)" }} />
          <div className="pointer-events-none absolute -bottom-24 left-8 h-44 w-44 rounded-full blur-3xl" style={{ background: "hsl(var(--accent-indigo) / 0.1)" }} />
          <div className="pointer-events-none absolute top-0 left-1/3 h-32 w-32 rounded-full blur-3xl" style={{ background: "hsl(var(--accent-violet) / 0.08)" }} />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              {/* Badge */}
              <div
                className="shimmer-sweep inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em]"
                style={{
                  background: "hsl(var(--accent-cyan) / 0.1)",
                  border: "1px solid hsl(var(--accent-cyan) / 0.25)",
                  color: "hsl(var(--accent-cyan))",
                }}
              >
                <span style={{ animation: "glow-pulse 3s ease-in-out infinite", display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--accent-cyan))" }} />
                Control Surface
              </div>

              {/* Headline */}
              <h1
                className="gradient-text-animated text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl"
                style={{ fontFamily: "var(--font-headline), 'Plus Jakarta Sans', sans-serif" }}
              >
                SearchAPI Console
              </h1>


            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-3 gap-2.5 text-xs sm:text-sm animate-fade-up" style={{ animationDelay: "0.25s" }}>
              <div
                className="rounded-xl px-4 py-2.5"
                style={{
                  background: "hsl(var(--accent-cyan) / 0.08)",
                  border: "1px solid hsl(var(--accent-cyan) / 0.15)",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--accent-cyan) / 0.7)" }}>Endpoint</p>
                <code className="font-mono text-xs" style={{ color: "hsl(var(--accent-cyan))" }}>GET /api/search</code>
              </div>
              <div
                className="rounded-xl px-4 py-2.5"
                style={{
                  background: "hsl(var(--accent-indigo) / 0.08)",
                  border: "1px solid hsl(var(--accent-indigo) / 0.15)",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--accent-indigo) / 0.7)" }}>Engines</p>
                <span style={{ color: "hsl(var(--accent-indigo))" }}>{activeEngineCount} active</span>
              </div>
              <div
                className="rounded-xl px-4 py-2.5"
                style={{
                  background: "hsl(var(--accent-violet) / 0.08)",
                  border: "1px solid hsl(var(--accent-violet) / 0.15)",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--accent-violet) / 0.7)" }}>Auth</p>
                <span style={{ color: "hsl(var(--accent-violet))" }}>API Key</span>
              </div>
            </div>
          </div>
        </header>

        {/* ═══════════════════════════════════════════
            TWO-COLUMN LAYOUT
        ═══════════════════════════════════════════ */}
        <div className="grid gap-6 xl:grid-cols-[minmax(340px,440px)_1fr]">

          {/* ═══ LEFT: Request Builder ═══ */}
          <form
            onSubmit={submitSearch}
            className="animate-fade-up flex flex-col gap-6 rounded-2xl border glass p-7"
            style={{
              borderColor: "hsl(var(--accent-cyan) / 0.1)",
              boxShadow: "0 24px 80px -30px hsl(185 90% 55% / 0.12), 0 8px 32px -8px rgba(0,0,0,0.3)",
              animationDelay: "0.15s",
            }}
          >
            {/* Section header */}
            <div className="flex items-center gap-2 pb-1">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs"
                style={{
                  background: "hsl(var(--accent-cyan) / 0.12)",
                  color: "hsl(var(--accent-cyan))",
                }}
              >
                ⚡
              </div>
              <h2 className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: "hsl(var(--fg-muted))" }}>
                Request Builder
              </h2>
            </div>

            {/* Query input */}
            <label className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--fg-muted))" }}>
                Search Query
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input-glow h-11 rounded-xl border px-4 text-sm text-white outline-none"
                style={{
                  background: "hsl(var(--input-bg))",
                  borderColor: "hsl(var(--border-color) / 0.5)",
                }}
                placeholder="Enter search keyword..."
                required
              />
            </label>

            {/* Search type toggle */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--fg-muted))" }}>
                Search Type
              </span>
              <div
                className="grid grid-cols-2 gap-1.5 rounded-xl border p-1.5"
                style={{
                  background: "hsl(var(--input-bg))",
                  borderColor: "hsl(var(--border-color) / 0.4)",
                }}
              >
                {(["text", "image"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setType(item)}
                    className={`type-toggle flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium ${
                      type === item ? "type-toggle-active" : ""
                    }`}
                    style={
                      type !== item
                        ? { color: "hsl(var(--fg-muted))" }
                        : undefined
                    }
                  >
                    <span>{item === "text" ? <TextIcon /> : <ImageIcon />}</span>
                    <span className="capitalize">{item}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Engine selection chips */}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--fg-muted))" }}>
                Search Engines
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {engines.map((engine) => {
                  const isActive = selectedEngines.includes(engine.id);
                  return (
                    <label
                      key={engine.id}
                      className={`engine-chip flex min-h-[48px] items-center gap-3 rounded-xl border px-3.5 py-2 ${
                        isActive ? "engine-chip-active" : ""
                      }`}
                      style={{
                        background: isActive
                          ? "hsl(var(--accent-cyan) / 0.08)"
                          : "hsl(var(--input-bg))",
                        borderColor: isActive
                          ? "hsl(var(--accent-cyan) / 0.35)"
                          : "hsl(var(--border-color) / 0.4)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleEngine(engine.id)}
                        className="sr-only"
                      />
                      <span className="flex items-center justify-center w-6 h-6">{engine.icon}</span>
                      <span
                        className="text-sm font-medium"
                        style={{
                          color: isActive
                            ? "hsl(var(--accent-cyan))"
                            : "hsl(var(--fg-muted))",
                        }}
                      >
                        {engine.label}
                      </span>
                      {isActive && (
                        <span
                          className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                          style={{
                            background: "hsl(var(--accent-cyan) / 0.2)",
                            color: "hsl(var(--accent-cyan))",
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Limit + API Key row */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--fg-muted))" }}>
                  Limit
                </span>
                <input
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="input-glow h-11 rounded-xl border px-4 text-sm text-white outline-none"
                  style={{
                    background: "hsl(var(--input-bg))",
                    borderColor: "hsl(var(--border-color) / 0.5)",
                  }}
                  inputMode="numeric"
                  min="1"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--fg-muted))" }}>
                  API Key 🔒
                </span>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-glow h-11 rounded-xl border px-4 text-sm text-white outline-none"
                  style={{
                    background: "hsl(var(--input-bg))",
                    borderColor: "hsl(var(--border-color) / 0.5)",
                  }}
                  placeholder="API Key"
                  type="password"
                  required
                />
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 btn-gradient shimmer-sweep relative h-12 rounded-xl text-sm font-bold tracking-wide"
              style={{
                boxShadow: isLoading
                  ? "none"
                  : "0 8px 32px hsl(185 90% 55% / 0.25)",
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                    style={{ animation: "spin-slow 0.8s linear infinite" }}
                  />
                  Searching…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  🚀 Run Search
                </span>
              )}
            </button>
          </form>

          {/* ═══ RIGHT: JSON Response Panel ═══ */}
          <section
            className="animate-slide-right flex h-[400px] min-h-0 flex-col overflow-hidden rounded-2xl border glass sm:h-[500px] xl:h-[calc(100vh-16rem)] xl:max-h-[720px]"
            style={{
              borderColor: "hsl(var(--accent-indigo) / 0.1)",
              boxShadow: "0 28px 80px -30px hsl(250 90% 65% / 0.12), 0 8px 32px -8px rgba(0,0,0,0.3)",
              animationDelay: "0.25s",
            }}
          >
            {/* Response header bar */}
            <div
              className="flex min-h-[52px] items-center justify-between gap-3 border-b px-5"
              style={{
                background: "hsl(var(--accent-indigo) / 0.04)",
                borderColor: "hsl(var(--border-color) / 0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: "hsl(350 85% 60%)" }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: "hsl(38 95% 60%)" }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: "hsl(160 70% 45%)" }} />
                </div>
                <h2 className="text-sm font-bold" style={{ color: "hsl(var(--fg))" }}>
                  Response
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* Metadata badges */}
                {elapsedMs !== null && (
                  <span
                    className="rounded-lg border px-2 py-1 font-mono text-[10px] font-semibold"
                    style={{
                      borderColor: "hsl(var(--accent-cyan) / 0.2)",
                      background: "hsl(var(--accent-cyan) / 0.06)",
                      color: "hsl(var(--accent-cyan))",
                    }}
                  >
                    {elapsedMs}ms
                  </span>
                )}
                {resultCount !== null && (
                  <span
                    className="rounded-lg border px-2 py-1 font-mono text-[10px] font-semibold"
                    style={{
                      borderColor: "hsl(var(--accent-indigo) / 0.2)",
                      background: "hsl(var(--accent-indigo) / 0.06)",
                      color: "hsl(var(--accent-indigo))",
                    }}
                  >
                    {resultCount} results
                  </span>
                )}
                {/* Status badge */}
                {status && (
                  <span className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold ${getStatusClass(status)}`}>
                    {status}
                  </span>
                )}
                {/* Copy button */}
                <button
                  type="button"
                  onClick={copyResponseJson}
                  disabled={isCopying}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200"
                  style={{
                    borderColor: copied
                      ? "hsl(var(--accent-emerald) / 0.4)"
                      : "hsl(var(--border-color) / 0.5)",
                    background: copied
                      ? "hsl(var(--accent-emerald) / 0.1)"
                      : "hsl(var(--accent-cyan) / 0.06)",
                    color: copied
                      ? "hsl(160 70% 60%)"
                      : "hsl(var(--accent-cyan))",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy JSON"}
                </button>
              </div>
            </div>

            {/* JSON body */}
            <div
              ref={responseRef}
              className="custom-scrollbar min-h-0 flex-1 overflow-auto"
              style={{ background: "hsl(222 50% 3.5%)" }}
            >
              <pre className="p-5 font-mono text-xs leading-7">
                <SyntaxHighlightedJson json={responseJson} />
              </pre>
            </div>
          </section>
        </div>

        {/* ═══════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════ */}
        <footer
          className="animate-fade-in flex items-center justify-between rounded-xl border px-5 py-3 text-xs"
          style={{
            background: "hsl(var(--bg-surface) / 0.4)",
            borderColor: "hsl(var(--border-color) / 0.3)",
            color: "hsl(var(--fg-subtle))",
            animationDelay: "0.5s",
          }}
        >
          <span>
            SearchAPI v0.1 — Multi-engine search console
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "hsl(var(--accent-emerald))", boxShadow: "0 0 8px hsl(160 70% 45% / 0.5)" }}
              />
              API Online
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}
