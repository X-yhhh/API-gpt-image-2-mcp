import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startHttpServer } from "../lib/http-server.mjs";

const runningServers = [];

async function createHttpTestServer({ env = {}, fileConfig, rawFile, endpoint = "/mcp" } = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-http-"));
  const configPath = path.join(tempRoot, "config.json");

  if (rawFile !== undefined) {
    await fs.writeFile(configPath, rawFile, "utf8");
  } else if (fileConfig !== undefined) {
    await fs.writeFile(configPath, JSON.stringify(fileConfig, null, 2), "utf8");
  }

  const serverHandle = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    endpoint,
    env: {
      HOME: "/Users/example",
      ...env
    },
    configPath
  });

  runningServers.push(serverHandle);

  return {
    baseUrl: `http://127.0.0.1:${serverHandle.server.address().port}`,
    configPath
  };
}

test.afterEach(async () => {
  while (runningServers.length > 0) {
    const serverHandle = runningServers.pop();
    await serverHandle.close();
  }
});

test("GET /ui serves the config console HTML", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/ui`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /ImageGen Config Console/);
});

test("GET /api/config returns config state with env overrides", async () => {
  const { baseUrl, configPath } = await createHttpTestServer({
    fileConfig: {
      baseUrl: "https://file.example/v1",
      apiKey: "sk-file"
    },
    env: {
      IMAGEGEN_API_KEY: "sk-env"
    }
  });

  const response = await fetch(`${baseUrl}/api/config`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.configPath, configPath);
  assert.equal(body.effectiveConfig.apiKey, "sk-env");
  assert.equal(body.fieldSources.apiKey, "env");
  assert.equal(body.hasOverrides, true);
});

test("PUT /api/config saves normalized config values", async () => {
  const { baseUrl, configPath } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      baseUrl: "https://gateway.example",
      apiKey: "  sk-test  ",
      model: "  custom-model  "
    })
  });

  const body = await response.json();
  const saved = JSON.parse(await fs.readFile(configPath, "utf8"));

  assert.equal(response.status, 200);
  assert.deepEqual(saved, {
    baseUrl: "https://gateway.example/v1",
    apiKey: "sk-test",
    model: "custom-model"
  });
  assert.deepEqual(body.fileConfig, saved);
});

test("PUT /api/config rejects invalid payloads with field errors", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      baseUrl: "",
      apiKey: "",
      model: ""
    })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body.error.fields, {
    baseUrl: "Base URL must be a valid URL.",
    apiKey: "API key is required.",
    model: "Model is required."
  });
});

test("the MCP endpoint keeps its existing JSON-RPC handling", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.message, "Missing initialization request.");
});
