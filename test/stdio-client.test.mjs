import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function createJsonResponse(payload) {
  return JSON.stringify(payload);
}

async function startFakeImageGateway({ responseDelayMs = 0 } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body
    });

    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      createJsonResponse({
        data: [{ b64_json: Buffer.from(`image-${requests.length}`).toString("base64") }]
      })
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    requests,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function startStdIoClient(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(currentDirectory, "..", "server.mjs")],
    env
  });
  const client = new Client(
    {
      name: "imagegen-stdio-test-client",
      version: "0.4.2"
    },
    {
      capabilities: {}
    }
  );

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    }
  };
}

test("stdio MCP server supports prompt, reference, and edit flows", async () => {
  const gateway = await startFakeImageGateway();
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-stdio-"));
  const stdioClient = await startStdIoClient({
    IMAGEGEN_BASE_URL: gateway.baseUrl,
    IMAGEGEN_API_KEY: "sk-test",
    IMAGEGEN_MODEL: "gpt-image-2"
  });

  try {
    const promptOnly = await stdioClient.client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "prompt only",
        outputDir,
        filename: "prompt-only"
      }
    });

    const referenceBased = await stdioClient.client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "reference based",
        referenceImages: ["data:image/png;base64,cG5nLXJlZg=="],
        outputDir,
        filename: "reference-based"
      }
    });

    const edited = await stdioClient.client.callTool({
      name: "edit_image",
      arguments: {
        prompt: "edit based",
        inputImages: ["data:image/png;base64,c291cmNlLWltYWdl"],
        outputDir,
        filename: "edited-image"
      }
    });

    assert.match(promptOnly.content[0].text, /Saved image file: prompt-only\.png/);
    assert.match(referenceBased.content[0].text, /Reference images used: 1/);
    assert.match(edited.content[0].text, /Source images used: 1/);

    assert.equal(gateway.requests.length, 3);
    assert.equal(gateway.requests[0].url, "/v1/images/generations");
    assert.equal(gateway.requests[1].url, "/v1/images/edits");
    assert.equal(gateway.requests[2].url, "/v1/images/edits");

    assert.match(gateway.requests[1].body.toString("utf8"), /name="image\[\]"/);
    assert.match(gateway.requests[2].body.toString("utf8"), /name="image\[\]"/);
  } finally {
    await stdioClient.close();
    await gateway.close();
  }
});

test("stdio MCP server returns a background job before the MCP client timeout", async () => {
  const gateway = await startFakeImageGateway({ responseDelayMs: 150 });
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-stdio-"));
  const stdioClient = await startStdIoClient({
    IMAGEGEN_BASE_URL: gateway.baseUrl,
    IMAGEGEN_API_KEY: "sk-test",
    IMAGEGEN_MODEL: "gpt-image-2",
    IMAGEGEN_MCP_SYNC_WAIT_MS: "10"
  });

  try {
    const initial = await stdioClient.client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "slow prompt",
        outputDir,
        filename: "slow-image"
      }
    });
    const initialText = initial.content[0].text;
    const jobId = initialText.match(/Job ID: (imgjob-[^\s]+)/)?.[1];

    assert.match(initialText, /Image job is still running/);
    assert.ok(jobId);

    const checked = await stdioClient.client.callTool({
      name: "check_image_job",
      arguments: {
        jobId,
        waitMs: 1000
      }
    });

    assert.match(checked.content[0].text, /Saved image file: slow-image\.png/);
    assert.doesNotMatch(checked.content[0].text, new RegExp(outputDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(gateway.requests.length, 1);
  } finally {
    await stdioClient.close();
    await gateway.close();
  }
});
