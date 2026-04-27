import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { startHttpServer } from "../lib/http-server.mjs";

const runningServers = [];

async function createHttpTestServer({ env = {}, endpoint = "/mcp" } = {}) {
  const serverHandle = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    endpoint,
    env: {
      HOME: "/Users/example",
      ...env
    }
  });

  runningServers.push(serverHandle);

  return {
    baseUrl: `http://127.0.0.1:${serverHandle.server.address().port}`
  };
}

test.afterEach(async () => {
  while (runningServers.length > 0) {
    const serverHandle = runningServers.pop();
    await serverHandle.close();
  }
});

test("GET /ui is not served by the HTTP MCP transport", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/ui`);

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not found.");
});

test("GET /ui assets are not served by the HTTP MCP transport", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/ui/app.js`);

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not found.");
});

test("the config API is not served by the HTTP MCP transport", async () => {
  const { baseUrl } = await createHttpTestServer();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "PUT"
  });

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not found.");
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

test("the MCP endpoint rejects missing bearer auth when HTTP auth is configured", async () => {
  const { baseUrl } = await createHttpTestServer({
    env: {
      IMAGEGEN_MCP_AUTH_TOKEN: "test-http-token"
    }
  });
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal(body.error.message, "Unauthorized.");
});

test("the MCP endpoint rejects invalid bearer auth when HTTP auth is configured", async () => {
  const { baseUrl } = await createHttpTestServer({
    env: {
      IMAGEGEN_MCP_AUTH_TOKEN: "test-http-token"
    }
  });
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: "Bearer wrong-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.message, "Unauthorized.");
});

test("the MCP endpoint accepts valid bearer auth when HTTP auth is configured", async () => {
  const { baseUrl } = await createHttpTestServer({
    env: {
      IMAGEGEN_MCP_AUTH_TOKEN: "test-http-token"
    }
  });
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-http-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.message, "Missing initialization request.");
});

test("the MCP endpoint rejects oversized JSON bodies with 413", async () => {
  const { baseUrl } = await createHttpTestServer();
  const url = new URL(`${baseUrl}/mcp`);
  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(20 * 1024 * 1024 + 1)
        }
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });

  assert.equal(response.status, 413);
  assert.match(response.body.error.message, /Request body exceeds/i);
});
