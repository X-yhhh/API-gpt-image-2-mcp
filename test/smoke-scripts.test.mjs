import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, "..");

async function startFakeImageGateway() {
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {}

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ b64_json: Buffer.from("fake-image").toString("base64") }] }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
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

test("mcp smoke test forwards IMAGEGEN_* env to the stdio child server", async () => {
  const gateway = await startFakeImageGateway();

  try {
    const { stdout } = await execFileAsync(process.execPath, ["mcp-smoke-test.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        IMAGEGEN_BASE_URL: gateway.baseUrl,
        IMAGEGEN_API_KEY: "sk-test",
        IMAGEGEN_MODEL: "gpt-image-2"
      }
    });

    assert.match(stdout, /"generate_image"/);
    assert.match(stdout, /"edit_image"/);
    assert.doesNotMatch(stdout, /Missing required baseUrl/);
  } finally {
    await gateway.close();
  }
});
