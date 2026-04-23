import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadRuntimeConfig,
  resolveConfigPath,
  resolveImageDataRoot
} from "../lib/runtime-config.mjs";

test("resolveConfigPath prefers IMAGEGEN_CONFIG_PATH", () => {
  const result = resolveConfigPath({
    env: {
      IMAGEGEN_CONFIG_PATH: "/tmp/custom-imagegen-config.json",
      HOME: "/Users/example"
    }
  });

  assert.equal(result, "/tmp/custom-imagegen-config.json");
});

test("resolveConfigPath falls back to XDG config home", () => {
  const result = resolveConfigPath({
    env: {
      HOME: "/Users/example",
      XDG_CONFIG_HOME: "/Users/example/.config"
    }
  });

  assert.equal(result, "/Users/example/.config/mcp-imagegen-server/config.json");
});

test("resolveImageDataRoot uses XDG data home", () => {
  const result = resolveImageDataRoot({
    env: {
      HOME: "/Users/example",
      XDG_DATA_HOME: "/Users/example/.local/share"
    }
  });

  assert.equal(result, "/Users/example/.local/share/mcp-imagegen-server/images");
});

test("loadRuntimeConfig reads the generic public config file", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "config.json");

  await fs.writeFile(
    configPath,
    JSON.stringify({
      baseUrl: "https://example.test",
      apiKey: "sk-test",
      model: "gpt-image-2"
    }),
    "utf8"
  );

  const config = await loadRuntimeConfig({
    env: {
      HOME: "/Users/example"
    },
    configPath
  });

  assert.equal(config.baseUrl, "https://example.test/v1");
  assert.equal(config.apiKey, "sk-test");
  assert.equal(config.model, "gpt-image-2");
});
