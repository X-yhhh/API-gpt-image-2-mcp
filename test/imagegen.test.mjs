import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateImage } from "../lib/imagegen.mjs";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function setRuntimeEnv() {
  process.env.IMAGEGEN_BASE_URL = "https://example.test";
  process.env.IMAGEGEN_API_KEY = "sk-test";
  process.env.IMAGEGEN_MODEL = "gpt-image-2";
}

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-test-"));
}

function installFetchStub(handler) {
  globalThis.fetch = handler;
}

async function readSha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test.afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("generateImage uses the negotiated fast-mode format for output files", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("jpeg-bytes").toString("base64");

  installFetchStub(async () => {
    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await generateImage({
    prompt: "test image",
    latencyMode: "fast",
    outputDir
  });

  assert.equal(result.format, "jpg");
  assert.match(result.outputPath, /\.jpg$/);
  assert.match(result.markdownEmbed, /\.jpg\)$/);
});

test("generateImage reports the SHA-256 of the saved image bytes", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("real-image-bytes").toString("base64");

  installFetchStub(async () => {
    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await generateImage({
    prompt: "hash test",
    outputDir
  });

  const actualSha256 = await readSha256(result.outputPath);
  assert.equal(result.sha256, actualSha256);
});

test("generateImage rejects mask-only requests before calling the edits endpoint", async () => {
  setRuntimeEnv();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "mask only",
      maskImage: "data:image/png;base64,AA=="
    }),
    /maskImage requires at least one reference image/i
  );

  assert.equal(fetchCalled, false);
});
