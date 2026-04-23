import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createImageGenServer } from "../lib/mcp-server.mjs";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function setRuntimeEnv() {
  process.env.IMAGEGEN_BASE_URL = "https://example.test";
  process.env.IMAGEGEN_API_KEY = "sk-test";
  process.env.IMAGEGEN_MODEL = "gpt-image-2";
}

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-mcp-test-"));
}

function installFetchStub(handler) {
  globalThis.fetch = handler;
}

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("generate_image tool output does not expose an absolute local path", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("png-bytes").toString("base64");

  installFetchStub(async () => {
    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const server = createImageGenServer();
  const tool = server._registeredTools.generate_image;
  const result = await server.executeToolHandler(
    tool,
    {
      prompt: "privacy-safe output",
      outputDir,
      filename: "demo-image",
      outputFormat: "png"
    },
    { _meta: {} }
  );

  const text = result.content[0].text;
  assert.match(text, /Saved image file: demo-image\.png/);
  assert.doesNotMatch(text, new RegExp(outputDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /Markdown embed: !\[generated image\]\(.*\)/);
});
