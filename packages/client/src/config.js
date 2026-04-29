import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const CONFIG_FILE = "config.json";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "[::]",
  "::1",
  "[::1]",
]);

export class SearchWeaveConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SearchWeaveConfigError";
    this.code = code;
  }
}

export function getConfigPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    const base = appData || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "SearchWeave", CONFIG_FILE);
  }

  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg || path.join(os.homedir(), ".config");
  return path.join(base, "searchweave", CONFIG_FILE);
}

export function isLoopbackBaseUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (LOOPBACK_HOSTS.has(hostname)) {
      return true;
    }

    return hostname.startsWith("127.");
  } catch {
    return false;
  }
}

export function loadConfigFile(configPath = getConfigPath()) {
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return sanitizeConfig(parsed);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw new SearchWeaveConfigError(
      "invalid_config",
      `Could not read SearchWeave config at ${configPath}.`,
    );
  }
}

export function saveConfigFile(nextConfig, configPath = getConfigPath()) {
  const dir = path.dirname(configPath);
  mkdirSync(dir, { recursive: true });

  const payload = JSON.stringify(sanitizeConfig(nextConfig), null, 2);
  writeFileSync(configPath, `${payload}\n`, "utf8");

  return configPath;
}

export function resolveClientConfig(options = {}) {
  const configPath = options.configPath || getConfigPath();
  const fromFile = options.readConfigFile === false ? {} : loadConfigFile(configPath);

  const hasExplicitBaseUrl = Object.prototype.hasOwnProperty.call(options, "baseUrl");
  const hasExplicitApiKey = Object.prototype.hasOwnProperty.call(options, "apiKey");

  const baseUrl = firstDefined(
    hasExplicitBaseUrl ? options.baseUrl : undefined,
    process.env.SEARCH_API_BASE_URL,
    fromFile.baseUrl,
    DEFAULT_BASE_URL,
  );

  const apiKey = firstDefined(
    hasExplicitApiKey ? options.apiKey : undefined,
    process.env.SEARCH_API_KEY,
    fromFile.apiKey,
    "",
  );

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new SearchWeaveConfigError(
      "invalid_base_url",
      "SEARCH_API_BASE_URL must be an absolute http(s) URL.",
    );
  }

  return {
    baseUrl: normalizedBaseUrl,
    apiKey: normalizeString(apiKey),
    configPath,
  };
}

export function createAuthHeaders(baseUrl, apiKey) {
  const token = normalizeString(apiKey);
  if (token) {
    return {
      authorization: `Bearer ${token}`,
    };
  }

  if (isLoopbackBaseUrl(baseUrl)) {
    return {};
  }

  throw new SearchWeaveConfigError(
    "missing_api_key",
    "An API key is required for non-local SearchWeave servers.",
  );
}

function sanitizeConfig(value) {
  return {
    ...(typeof value.baseUrl === "string"
      ? { baseUrl: normalizeString(value.baseUrl) }
      : {}),
    ...(typeof value.apiKey === "string" ? { apiKey: normalizeString(value.apiKey) } : {}),
  };
}

function isMissingFileError(error) {
  return Boolean(error && typeof error === "object" && error.code === "ENOENT");
}

function normalizeBaseUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    return "";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "";
  }

  return url.toString().replace(/\/$/, "");
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}