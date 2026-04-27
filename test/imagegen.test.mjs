import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateImage, HTTP_TRANSPORT_POLICY, MAX_REMOTE_IMAGE_BYTES } from "../lib/imagegen.mjs";

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

test("generateImage accepts parameterized base64 data URLs for reference images", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("referenced-image").toString("base64");
  let uploadedFile;

  installFetchStub(async (url, options) => {
    assert.match(url, /\/images\/edits$/);
    const files = options.body.getAll("image[]");
    assert.equal(files.length, 1);
    [uploadedFile] = files;

    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await generateImage({
    prompt: "parameterized data url",
    referenceImages: ["data:image/png;charset=utf-8;base64,AA=="],
    outputDir
  });

  assert.equal(result.referenceImageCount, 1);
  assert.equal(uploadedFile.type, "image/png");
  assert.match(uploadedFile.name, /\.png$/);
});

test("generateImage preserves SVG uploads for metadata-rich data URLs", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("svg-image").toString("base64");
  const svgDataUrl = `data:image/svg+xml;name=icon;base64,${Buffer.from("<svg/>").toString("base64")}`;
  let uploadedFile;

  installFetchStub(async (_url, options) => {
    [uploadedFile] = options.body.getAll("image[]");

    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  await generateImage({
    prompt: "svg data url",
    referenceImages: [svgDataUrl],
    outputDir
  });

  assert.equal(uploadedFile.type, "image/svg+xml");
  assert.match(uploadedFile.name, /\.svg$/);
});

test("generateImage accepts custom sizes that match the API format", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("custom-size-bytes").toString("base64");
  let requestBody;

  installFetchStub(async (_url, options) => {
    requestBody = JSON.parse(options.body);

    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await generateImage({
    prompt: "custom size test",
    size: "1235x777",
    outputDir
  });

  assert.equal(result.size, "1235x777");
  assert.equal(requestBody.size, "1235x777");
});

test("stdio policy keeps local file paths and outputDir available", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const referencePath = path.join(outputDir, "source.png");
  const payload = Buffer.from("local-reference-output").toString("base64");
  let uploadedFile;

  await fs.writeFile(referencePath, Buffer.from("local-source"));

  installFetchStub(async (_url, options) => {
    [uploadedFile] = options.body.getAll("image[]");

    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await generateImage({
    prompt: "local file reference",
    referenceImages: [referencePath],
    outputDir,
    filename: "local-output"
  });

  assert.equal(uploadedFile.name, "source.png");
  assert.equal(result.outputPath, path.join(outputDir, "local-output.png"));
});

test("http policy rejects local file image sources", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const referencePath = path.join(outputDir, "source.png");
  let fetchCalled = false;

  await fs.writeFile(referencePath, Buffer.from("local-source"));
  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "http local source",
      referenceImages: [referencePath],
      transportPolicy: HTTP_TRANSPORT_POLICY
    }),
    /http transport does not accept local file path/i
  );

  assert.equal(fetchCalled, false);
});

test("http policy rejects outputDir", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "http output dir",
      outputDir,
      transportPolicy: HTTP_TRANSPORT_POLICY
    }),
    /http transport does not accept outputDir/i
  );

  assert.equal(fetchCalled, false);
});

test("remote image downloads reject private DNS answers", async () => {
  setRuntimeEnv();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "private dns",
      referenceImages: ["https://images.example.test/source.png"],
      resolveHostname: async () => [{ address: "10.0.0.5", family: 4 }]
    }),
    /public addresses only/i
  );

  assert.equal(fetchCalled, false);
});

test("remote image downloads reject localhost literal hosts", async () => {
  setRuntimeEnv();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "localhost literal",
      referenceImages: ["http://localhost/source.png"]
    }),
    /public address/i
  );

  assert.equal(fetchCalled, false);
});

test("remote image downloads reject IPv4-mapped IPv6 loopback literals", async () => {
  setRuntimeEnv();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "ipv4 mapped loopback",
      referenceImages: ["http://[::ffff:127.0.0.1]/source.png"]
    }),
    /public addresses only/i
  );

  assert.equal(fetchCalled, false);
});

test("remote image downloads reject IPv6 link-local literals", async () => {
  setRuntimeEnv();
  let fetchCalled = false;

  installFetchStub(async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    generateImage({
      prompt: "ipv6 link local",
      referenceImages: ["http://[fe81::1]/source.png"]
    }),
    /public addresses only/i
  );

  assert.equal(fetchCalled, false);
});

test("remote image downloads reject redirects to private hosts", async () => {
  setRuntimeEnv();
  let requestCount = 0;

  installFetchStub(async () => {
    requestCount += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private.png" }
    });
  });

  await assert.rejects(
    generateImage({
      prompt: "redirect private",
      referenceImages: ["https://images.example.test/source.png"],
      resolveHostname: async (hostname) => {
        if (hostname === "images.example.test") {
          return [{ address: "93.184.216.34", family: 4 }];
        }
        return [{ address: "127.0.0.1", family: 4 }];
      }
    }),
    /public addresses only/i
  );

  assert.equal(requestCount, 1);
});

test("remote image downloads enforce content-length limit", async () => {
  setRuntimeEnv();

  installFetchStub(async (url, options) => {
    if (String(url).includes("/images/")) {
      throw new Error("gateway should not be called");
    }

    return new Response(null, {
      status: 200,
      headers: { "content-length": String(MAX_REMOTE_IMAGE_BYTES + 1) }
    });
  });

  await assert.rejects(
    generateImage({
      prompt: "too large remote",
      referenceImages: ["https://images.example.test/source.png"],
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }]
    }),
    /download limit/i
  );
});

test("remote image downloads accept public URLs within limits", async () => {
  setRuntimeEnv();
  const outputDir = await createTempDir();
  const payload = Buffer.from("remote-ok-output").toString("base64");
  let uploadedFile;

  installFetchStub(async (url, options) => {
    if (String(url).includes("/images/edits")) {
      [uploadedFile] = options.body.getAll("image[]");
      return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(Buffer.from("remote-image"), {
      status: 200,
      headers: { "content-type": "image/png" }
    });
  });

  const result = await generateImage({
    prompt: "public remote",
    referenceImages: ["https://images.example.test/source.png"],
    outputDir,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }]
  });

  assert.equal(uploadedFile.name, "source.png");
  assert.equal(result.referenceImageCount, 1);
});
