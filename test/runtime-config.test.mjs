import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getRuntimeConfigState,
  loadRuntimeConfig,
  readRuntimeConfigFile,
  resolveConfigPath,
  resolveImageDataRoot,
  writeRuntimeConfigFile
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

test("readRuntimeConfigFile returns an empty config when the file is missing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "config.json");

  const result = await readRuntimeConfigFile({ configPath });

  assert.equal(result.exists, false);
  assert.equal(result.configPath, configPath);
  assert.deepEqual(result.fileConfig, {});
});

test("readRuntimeConfigFile preserves malformed JSON errors", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "config.json");

  await fs.writeFile(configPath, "{", "utf8");

  await assert.rejects(() => readRuntimeConfigFile({ configPath }), SyntaxError);
});

test("readRuntimeConfigFile accepts UTF-8 BOM JSON files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "config.json");

  await fs.writeFile(
    configPath,
    Buffer.from(`\uFEFF${JSON.stringify({ baseUrl: "https://example.test", apiKey: "sk-test" })}\n`, "utf8")
  );

  const result = await readRuntimeConfigFile({ configPath });

  assert.deepEqual(result.fileConfig, {
    baseUrl: "https://example.test",
    apiKey: "sk-test"
  });
});

test("getRuntimeConfigState reports env overrides and defaults", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "config.json");

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        baseUrl: "https://file.example/v1",
        apiKey: "sk-file"
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await getRuntimeConfigState({
    env: {
      HOME: "/Users/example",
      IMAGEGEN_API_KEY: "sk-env"
    },
    configPath
  });

  assert.equal(result.configPath, configPath);
  assert.deepEqual(result.fileConfig, {
    baseUrl: "https://file.example/v1",
    apiKey: "sk-file",
    model: ""
  });
  assert.deepEqual(result.effectiveConfig, {
    baseUrl: "https://file.example/v1",
    apiKey: "sk-env",
    model: "gpt-image-2"
  });
  assert.deepEqual(result.fieldSources, {
    baseUrl: "file",
    apiKey: "env",
    model: "default"
  });
  assert.equal(result.hasOverrides, true);
});

test("writeRuntimeConfigFile creates the parent directory and normalizes baseUrl", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "nested", "config.json");

  await writeRuntimeConfigFile({
    configPath,
    config: {
      baseUrl: "https://example.test",
      apiKey: "  sk-test  ",
      model: " custom-model "
    }
  });

  const saved = JSON.parse(await fs.readFile(configPath, "utf8"));

  assert.deepEqual(saved, {
    baseUrl: "https://example.test/v1",
    apiKey: "sk-test",
    model: "custom-model"
  });
});

test("writeRuntimeConfigFile writes UTF-8 without BOM", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-config-"));
  const configPath = path.join(tempRoot, "nested", "config.json");

  await writeRuntimeConfigFile({
    configPath,
    config: {
      baseUrl: "https://example.test",
      apiKey: "sk-test",
      model: "gpt-image-2"
    }
  });

  const bytes = await fs.readFile(configPath);

  assert.notDeepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});
