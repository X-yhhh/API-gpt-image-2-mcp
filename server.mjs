#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { formatUsage, parseCliArgs } from "./lib/cli.mjs";
import { startHttpServer } from "./lib/http-server.mjs";
import { createImageGenServer } from "./lib/mcp-server.mjs";
import { resolveServerEntryPathFromFileUrl, runConfigure } from "./lib/setup.mjs";
import { RuntimeConfigUsageError, assertRuntimeConfigReady } from "./lib/runtime-config.mjs";

const argv = process.argv.slice(2);

if (argv.includes("--help")) {
  console.log(formatUsage());
  process.exit(0);
}

const args = parseCliArgs(argv);

if (args.configure) {
  await runConfigure({
    serverEntryPath: resolveServerEntryPathFromFileUrl(new URL("./server.mjs", import.meta.url))
  });
} else if (args.transport === "http") {
  const httpServer = await startHttpServer(args);

  const shutdown = async () => {
    await httpServer.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.error(`mcp-imagegen-server listening on http://${args.host}:${args.port}${args.endpoint}`);
} else {
  try {
    await assertRuntimeConfigReady();
  } catch (error) {
    if (error instanceof RuntimeConfigUsageError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }

  const server = createImageGenServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
