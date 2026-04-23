import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const forwardedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.startsWith("IMAGEGEN_"))
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(currentDirectory, "server.mjs")],
  env: forwardedEnv
});

const client = new Client(
  {
  name: "imagegen-smoke-client",
    version: "0.4.1"
  },
  {
    capabilities: {}
  }
);

await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool({
  name: "generate_image",
  arguments: {
    prompt: "A minimalist blue geometric poster with strong negative space and crisp shapes.",
    size: "1024x1536",
    quality: "high",
    outputFormat: "png",
    projectName: "mcp-smoke-test",
    filename: "mcp-smoke-test-blue-poster"
  }
});

console.log(JSON.stringify({ tools: tools.tools.map(tool => tool.name), result }, null, 2));

await client.close();
