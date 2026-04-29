import { describe, expect, it } from "vitest";
import { runCli } from "./main.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";

function createIo(overrides = {}) {
  const stdout = [];
  const stderr = [];

  return {
    stdout: {
      isTTY: true,
      write(value) {
        stdout.push(String(value));
      },
    },
    stderr: {
      isTTY: true,
      write(value) {
        stderr.push(String(value));
      },
    },
    stdin: {
      isTTY: true,
    },
    prompt: overrides.prompt,
    getStdout() {
      return stdout.join("");
    },
    getStderr() {
      return stderr.join("");
    },
  };
}

describe("@searchweave/cli prompt flow", () => {
  it("initializes config via prompts", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "sw-cli-"));
    const configPath = path.join(tempDir, "config.json");
    const answers = ["http://127.0.0.1:3000", ""];

    const io = createIo({
      prompt: async (_label, defaultValue) => {
        const value = answers.shift();
        return value === undefined ? defaultValue : value;
      },
    });

    const exitCode = await runCli(["config", "init", "--config-path", configPath], io);
    expect(exitCode).toBe(0);

    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.baseUrl).toBe("http://127.0.0.1:3000");
    expect(parsed.apiKey).toBe("");
  });
});

describe("@searchweave/cli config reuse", () => {
  it("prints existing config", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "sw-cli-"));
    const configPath = path.join(tempDir, "config.json");

    const setupIo = createIo({
      prompt: async (_label, defaultValue) => defaultValue,
    });

    await runCli(["config", "init", "--config-path", configPath], setupIo);

    const io = createIo();
    const exitCode = await runCli(["config", "show", "--config-path", configPath], io);
    expect(exitCode).toBe(0);
    const output = JSON.parse(io.getStdout());
    expect(output.configPath).toBe(configPath);
  });
});

describe("@searchweave/cli non-interactive failures", () => {
  it("returns non-zero when prompt is required but TTY is unavailable", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "sw-cli-"));
    const configPath = path.join(tempDir, "config.json");

    const io = createIo();
    io.stdin.isTTY = false;
    io.stdout.isTTY = false;

    const exitCode = await runCli(["config", "init", "--config-path", configPath], io);
    expect(exitCode).toBe(1);
    expect(io.getStderr()).toContain("Cannot prompt");
  });
});
