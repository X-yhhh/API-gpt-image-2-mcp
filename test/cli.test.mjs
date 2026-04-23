import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArgs } from "../lib/cli.mjs";

test("parseCliArgs defaults to stdio transport", () => {
  const args = parseCliArgs([]);

  assert.deepEqual(args, {
    configure: false,
    transport: "stdio",
    host: "127.0.0.1",
    port: 3000,
    endpoint: "/mcp"
  });
});

test("parseCliArgs supports streamable HTTP options", () => {
  const args = parseCliArgs([
    "--transport",
    "http",
    "--host",
    "0.0.0.0",
    "--port",
    "4123",
    "--endpoint",
    "/rpc"
  ]);

  assert.deepEqual(args, {
    configure: false,
    transport: "http",
    host: "0.0.0.0",
    port: 4123,
    endpoint: "/rpc"
  });
});

test("parseCliArgs supports configure mode", () => {
  const args = parseCliArgs(["--configure"]);

  assert.deepEqual(args, {
    configure: true,
    transport: "stdio",
    host: "127.0.0.1",
    port: 3000,
    endpoint: "/mcp"
  });
});

test("parseCliArgs rejects unsupported transport values", () => {
  assert.throws(() => parseCliArgs(["--transport", "sse"]), /Unsupported transport/);
});
