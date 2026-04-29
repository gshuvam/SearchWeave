import {
  SearchWeaveClient,
  SearchWeaveConfigError,
  getConfigPath,
  loadConfigFile,
  resolveClientConfig,
  saveConfigFile,
} from "@searchweave/client";
import readline from "node:readline/promises";

const HELP_TEXT = `searchweave <command>

Commands:
  search            Execute a search request
  config init       Prompt and save config
  config set        Update config values
  config show       Print current config JSON

Search flags:
  --q, --query            Query text (required)
  --type                  text | image
  --engine                engine list (comma-separated or repeated)
  --limit                 positive integer
  --google-cookie         google_cookie value
  --base-url              override API base URL
  --api-key               override API key
`;

export async function runCli(argv, io = defaultIo()) {
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "-h" || command === "--help") {
    io.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  try {
    if (command === "config") {
      if (subcommand === "init") {
        await handleConfigInit(io, parseFlags(rest));
        return 0;
      }

      if (subcommand === "set") {
        await handleConfigSet(io, parseFlags(rest));
        return 0;
      }

      if (subcommand === "show") {
        handleConfigShow(io, parseFlags(rest));
        return 0;
      }

      throw new SearchWeaveConfigError(
        "invalid_command",
        "config requires one of: init, set, show",
      );
    }

    if (command === "search") {
      await handleSearch(io, parseFlags([subcommand, ...rest].filter(Boolean)));
      return 0;
    }

    throw new SearchWeaveConfigError(
      "invalid_command",
      `Unknown command: ${command}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SearchWeave CLI failed unexpectedly.";
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

async function handleConfigInit(io, flags) {
  const configPath = flags["config-path"] || getConfigPath();
  const existing = loadConfigFile(configPath);

  const baseUrlDefault =
    normalizeOptional(flags["base-url"]) ||
    existing.baseUrl ||
    process.env.SEARCH_API_BASE_URL ||
    "http://127.0.0.1:3000";

  const apiKeyDefault =
    normalizeOptional(flags["api-key"]) ||
    existing.apiKey ||
    process.env.SEARCH_API_KEY ||
    "";

  const baseUrl = await ask(io, "Base URL", baseUrlDefault);
  const apiKey = await ask(io, "API key (leave blank for localhost)", apiKeyDefault);

  const resolved = resolveClientConfig({
    configPath,
    readConfigFile: false,
    baseUrl,
    apiKey,
  });

  saveConfigFile({
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
  }, configPath);

  io.stdout.write(`Saved config to ${configPath}\n`);
}

async function handleConfigSet(io, flags) {
  const configPath = flags["config-path"] || getConfigPath();
  const existing = loadConfigFile(configPath);

  const hasBaseUrl = Object.prototype.hasOwnProperty.call(flags, "base-url");
  const hasApiKey = Object.prototype.hasOwnProperty.call(flags, "api-key");

  const nextConfig = {
    baseUrl: hasBaseUrl ? normalizeOptional(flags["base-url"]) : existing.baseUrl,
    apiKey: hasApiKey ? normalizeOptional(flags["api-key"]) : existing.apiKey,
  };

  const resolved = resolveClientConfig({
    configPath,
    readConfigFile: false,
    baseUrl: nextConfig.baseUrl,
    apiKey: nextConfig.apiKey,
  });

  saveConfigFile(
    {
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
    },
    configPath,
  );

  io.stdout.write(`Updated config at ${configPath}\n`);
}

function handleConfigShow(io, flags) {
  const configPath = flags["config-path"] || getConfigPath();
  const config = loadConfigFile(configPath);

  io.stdout.write(
    `${JSON.stringify(
      {
        configPath,
        baseUrl: config.baseUrl || "",
        apiKey: config.apiKey || "",
      },
      null,
      2,
    )}\n`,
  );
}

async function handleSearch(io, flags) {
  const query = normalizeOptional(flags.q ?? flags.query);
  if (!query) {
    throw new SearchWeaveConfigError(
      "missing_query",
      "search requires --q <query> or --query <query>",
    );
  }

  const baseUrl = normalizeOptional(flags["base-url"]);
  const apiKey = Object.prototype.hasOwnProperty.call(flags, "api-key")
    ? normalizeOptional(flags["api-key"])
    : undefined;
  const configPath = normalizeOptional(flags["config-path"]);

  const client = await getClientWithOptionalSetup(io, {
    ...(baseUrl !== "" ? { baseUrl } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(configPath !== "" ? { configPath } : {}),
  });

  const response = await client.search({
    q: query,
    type: normalizeOptional(flags.type) || undefined,
    engine: normalizeEngines(flags.engine),
    limit: normalizeOptional(flags.limit) ? Number(flags.limit) : undefined,
    google_cookie: normalizeOptional(flags["google-cookie"]) || undefined,
  });

  io.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
}

async function getClientWithOptionalSetup(io, options) {
  try {
    return new SearchWeaveClient(options);
  } catch (error) {
    if (
      error instanceof SearchWeaveConfigError &&
      error.code === "missing_api_key" &&
      isInteractive(io)
    ) {
      io.stderr.write(
        "No API key found for a non-local server. Starting config init flow.\n",
      );
      await handleConfigInit(io, {});
      return new SearchWeaveClient(options);
    }

    throw error;
  }
}

function parseFlags(values) {
  const flags = {};

  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }

    const pair = token.slice(2).split("=", 2);
    const key = pair[0];
    let value = pair.length > 1 ? pair[1] : undefined;

    if (value === undefined) {
      const next = values[index + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else {
        value = "true";
      }
    }

    if (key === "engine") {
      const current = flags.engine;
      flags.engine = current ? `${current},${value}` : value;
      continue;
    }

    flags[key] = value;
  }

  return flags;
}

function normalizeEngines(value) {
  if (!value) {
    return undefined;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function normalizeOptional(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

async function ask(io, label, defaultValue) {
  if (io.prompt) {
    return io.prompt(label, defaultValue);
  }

  if (!isInteractive(io)) {
    throw new SearchWeaveConfigError(
      "missing_interactive_tty",
      `Cannot prompt for ${label} in a non-interactive session. Use config set or flags instead.`,
    );
  }

  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout,
  });

  try {
    const promptLabel = defaultValue
      ? `${label} [${defaultValue}]: `
      : `${label}: `;
    const answer = await rl.question(promptLabel);
    const normalized = normalizeOptional(answer);
    return normalized || defaultValue;
  } finally {
    rl.close();
  }
}

function isInteractive(io) {
  return Boolean(io.stdin?.isTTY && io.stdout?.isTTY);
}

function defaultIo() {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    prompt: undefined,
  };
}
