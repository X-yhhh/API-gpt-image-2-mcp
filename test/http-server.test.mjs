import test from "node:test";
import assert from "node:assert/strict";

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
