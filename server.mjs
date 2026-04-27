#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { formatUsage, parseCliArgs } from "./lib/cli.mjs";
import { startHttpServer } from "./lib/http-server.mjs";
import { STDIO_TRANSPORT_POLICY } from "./lib/imagegen.mjs";
import { createImageGenServer } from "./lib/mcp-server.mjs";

const argv = process.argv.slice(2);

if (argv.includes("--help")) {
  console.log(formatUsage());
  process.exit(0);
}

const args = parseCliArgs(argv);

if (args.transport === "http") {
  const httpServer = await startHttpServer(args);

  const shutdown = async () => {
    await httpServer.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.error(`mcp-imagegen-server listening on http://${args.host}:${args.port}${args.endpoint}`);
} else {
  const server = createImageGenServer(STDIO_TRANSPORT_POLICY);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
