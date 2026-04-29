import { existsSync } from "node:fs";
import * as cheerio from "cheerio";
import { toAbsoluteUrl } from "./url";

type BrowserFetchOptions = {
  timeoutMs: number;
  signal: AbortSignal;
  userAgent: string;
  cookieHeader?: string;
  interactiveCaptchaEnabled?: boolean;
  interactiveCaptchaTimeoutMs?: number;
};

export type BrowserFetchResult = {
  html: string;
  finalUrl: string;
  captchaUrl?: string;
};

type BrowserCookie = {
  name: string;
  value: string;
};

type BrowserPage = {
  close: () => Promise<void>;
  content: () => Promise<string>;
  evaluate: <T>(callback: () => T | Promise<T>) => Promise<T>;
  goto: (
    url: string,
    options: { waitUntil: "domcontentloaded"; timeout: number },
  ) => Promise<unknown>;
  setCookie: (
    ...cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
    }>
  ) => Promise<void>;
  setExtraHTTPHeaders: (headers: Record<string, string>) => Promise<void>;
  setUserAgent: (userAgent: string) => Promise<void>;
  url: () => string;
};

type BrowserInstance = {
  close: () => Promise<void>;
  newPage: () => Promise<BrowserPage>;
};

type PuppeteerLike = {
  launch: (options: Record<string, unknown>) => Promise<BrowserInstance>;
};

export async function fetchWithBrowserFallback(
  url: string,
  options: BrowserFetchOptions,
): Promise<BrowserFetchResult> {
  const interactiveCaptchaEnabled = options.interactiveCaptchaEnabled === true;
  const interactiveCaptchaTimeoutMs =
    options.interactiveCaptchaTimeoutMs ?? options.timeoutMs;
  const [puppeteer, launchOptions] = await Promise.all([
    loadPuppeteerModule(),
    resolveLaunchOptions(interactiveCaptchaEnabled),
  ]);

  const browser = await launchBrowser(puppeteer, launchOptions);
  let page: BrowserPage | null = null;

  try {
    page = await browser.newPage();
    const activePage = page;
    await activePage.setUserAgent(options.userAgent);
    await activePage.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    const cookies = parseCookieHeader(options.cookieHeader);
    if (cookies.length > 0) {
      await activePage.setCookie(
        ...cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: ".google.com",
          path: "/",
          secure: true,
        })),
      );
    }

    await waitForAbortSignal(options.signal, options.timeoutMs, async () => {
      await activePage.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: options.timeoutMs,
      });
      await tryPostNavigationScroll(activePage);
    });

    let { html, finalUrl } = await readPageSnapshot(activePage, {
      signal: options.signal,
      timeoutMs: Math.min(options.timeoutMs, 5_000),
    });
    let captchaUrl = extractCaptchaUrl(html, finalUrl);

    if (interactiveCaptchaEnabled && captchaUrl) {
      const solved = await waitForCaptchaResolution(activePage, {
        signal: options.signal,
        timeoutMs: interactiveCaptchaTimeoutMs,
      });
      html = solved.html;
      finalUrl = solved.finalUrl;
      captchaUrl = solved.captchaUrl;
    }

    return {
      html,
      finalUrl,
      captchaUrl,
    };
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }
}

function parseCookieHeader(cookieHeader: string | undefined): BrowserCookie[] {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        return null;
      }

      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!name || !value) {
        return null;
      }

      return { name, value };
    })
    .filter((cookie): cookie is BrowserCookie => cookie !== null);
}

function extractCaptchaUrl(html: string, finalUrl: string): string | undefined {
  const lower = html.toLowerCase();
  if (
    !lower.includes("captcha") &&
    !lower.includes("if you're having trouble accessing google search") &&
    !lower.includes("not a robot") &&
    !finalUrl.includes("sorry")
  ) {
    return undefined;
  }

  const $ = cheerio.load(html);
  const href =
    $("a[href*='/sorry/']").first().attr("href") ??
    $("a[href*='emsg=SG_REL']").first().attr("href") ??
    $("a[href*='captcha']").first().attr("href");

  const resolved =
    toAbsoluteUrl(href, "https://www.google.com") ??
    (finalUrl ? toAbsoluteUrl(finalUrl, "https://www.google.com") : undefined);

  return resolved ?? undefined;
}

async function waitForCaptchaResolution(
  page: BrowserPage,
  options: { signal: AbortSignal; timeoutMs: number },
) {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (options.signal.aborted) {
      throw new Error("Browser fallback aborted.");
    }

    const { html, finalUrl } = await readPageSnapshot(page, {
      signal: options.signal,
      timeoutMs: 3_000,
    });
    const captchaUrl = extractCaptchaUrl(html, finalUrl);

    if (!captchaUrl) {
      return {
        html,
        finalUrl,
        captchaUrl: undefined,
      };
    }

    await delay(1_250);
  }

  const { html, finalUrl } = await readPageSnapshot(page, {
    signal: options.signal,
    timeoutMs: 3_000,
  });

  return {
    html,
    finalUrl,
    captchaUrl: extractCaptchaUrl(html, finalUrl),
  };
}

async function readPageSnapshot(
  page: BrowserPage,
  options: { signal: AbortSignal; timeoutMs: number },
) {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (options.signal.aborted) {
      throw new Error("Browser fallback aborted.");
    }

    try {
      return {
        html: await page.content(),
        finalUrl: page.url(),
      };
    } catch (error) {
      if (!isRecoverableNavigationError(error)) {
        throw error;
      }

      lastError = error;
      await delay(250);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Browser fallback failed while waiting for page content.");
}

async function tryPostNavigationScroll(page: BrowserPage) {
  await delay(1_000);

  try {
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * 1.4));
    });
    await delay(700);
  } catch (error) {
    if (!isRecoverableNavigationError(error)) {
      throw error;
    }
    await delay(500);
  }
}

async function waitForAbortSignal(
  signal: AbortSignal,
  timeoutMs: number,
  action: () => Promise<void>,
) {
  if (signal.aborted) {
    throw new Error("Browser fallback aborted.");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener = () => undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(new Error("Browser fallback aborted."));
    };

    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Browser fallback timed out."));
    }, timeoutMs);

    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    await Promise.race([action(), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    removeAbortListener();
  }
}

async function loadPuppeteerModule(): Promise<PuppeteerLike> {
  try {
    const moduleName = "puppeteer-core";
    const imported = await import(moduleName);
    const candidate = (imported as { default?: unknown }).default ?? imported;
    if (!isPuppeteerLike(candidate)) {
      throw new Error("Invalid puppeteer-core module shape.");
    }
    return candidate;
  } catch (error) {
    throw new Error(
      `Browser fallback requires puppeteer-core to be installed. ${toErrorMessage(error)}`,
    );
  }
}

async function resolveLaunchOptions(interactiveCaptchaEnabled: boolean) {
  const chromiumSettings = await loadChromiumSettings();
  const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const executablePath = resolveExecutablePath(
    chromiumSettings.executablePath,
    configuredPath,
    resolveLocalChromePath(),
  );

  const launchOptions: Record<string, unknown> = {
    headless: interactiveCaptchaEnabled ? false : true,
    args: chromiumSettings.args ?? [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--no-sandbox",
    ],
    executablePath,
    defaultViewport: chromiumSettings.defaultViewport ?? {
      width: 1366,
      height: 900,
    },
  };

  if (!executablePath) {
    throw new Error(
      "Browser fallback could not find a Chromium executable. Set PUPPETEER_EXECUTABLE_PATH.",
    );
  }

  return launchOptions;
}

async function loadChromiumSettings() {
  // @sparticuz/chromium ships Linux binaries and is primarily for serverless Linux.
  // Skip it on local Windows/macOS to avoid invalid executable paths.
  if (process.platform !== "linux") {
    return {
      args: undefined,
      defaultViewport: undefined,
      executablePath: undefined,
    };
  }

  try {
    const moduleName = "@sparticuz/chromium";
    const imported = await import(moduleName);
    const chromium = imported.default ?? imported;

    const executablePath = (await chromium.executablePath()) as
      | string
      | undefined;
    return {
      args: chromium.args as string[] | undefined,
      defaultViewport: chromium.defaultViewport as
        | { width: number; height: number }
        | undefined,
      executablePath: isExecutablePathUsable(executablePath)
        ? executablePath
        : undefined,
    };
  } catch {
    return {
      args: undefined,
      defaultViewport: undefined,
      executablePath: undefined,
    };
  }
}

function resolveLocalChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown browser fallback error.";
}

function isPuppeteerLike(value: unknown): value is PuppeteerLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "launch" in value &&
    typeof (value as { launch?: unknown }).launch === "function"
  );
}

function resolveExecutablePath(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }

    if (isExecutablePathUsable(trimmed)) {
      return trimmed;
    }
  }

  return undefined;
}

function isExecutablePathUsable(path: string | undefined) {
  if (!path) {
    return false;
  }

  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

async function launchBrowser(
  puppeteer: PuppeteerLike,
  launchOptions: Record<string, unknown>,
) {
  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    throw new Error(formatLaunchError(error, launchOptions));
  }
}

function formatLaunchError(error: unknown, launchOptions: Record<string, unknown>) {
  const executablePath = String(launchOptions.executablePath ?? "");
  const isHeadfulMode = launchOptions.headless === false;
  const base =
    error instanceof Error ? error.message : "Unknown browser launch failure.";

  if (
    isHeadfulMode &&
    (base.includes("Failed to launch the browser process") ||
      base.includes("Missing X server") ||
      base.includes("Missing X server or $DISPLAY"))
  ) {
    return [
      "Interactive CAPTCHA mode requires a display-capable browser session.",
      "Disable SEARCH_ENABLE_INTERACTIVE_CAPTCHA in headless/serverless environments.",
      base,
    ].join(" ");
  }

  if (
    base.includes("ENOENT") ||
    base.includes("Failed to launch the browser process")
  ) {
    return [
      "Browser executable could not be launched.",
      executablePath ? `Path: ${executablePath}` : "Path: <not resolved>",
      "Set PUPPETEER_EXECUTABLE_PATH to a valid Chrome/Edge binary path.",
    ].join(" ");
  }

  return base;
}

function isRecoverableNavigationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("execution context was destroyed") ||
    message.includes("cannot find context with specified id") ||
    message.includes("detached frame")
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
