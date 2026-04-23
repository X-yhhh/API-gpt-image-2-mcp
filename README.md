# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` is a public Model Context Protocol server for image generation and editing through an OpenAI-compatible image API.

It exposes two MCP tools:

- `generate_image`
- `edit_image`

The server supports both:

- `stdio` transport for local MCP clients
- streamable HTTP transport for hosted or remote MCP deployments

## Requirements

- Node.js 20 or newer
- Access to an OpenAI-compatible image endpoint that supports:
  - `POST /images/generations`
  - `POST /images/edits`

## Installation

```bash
npm install
```

For local execution:

```bash
npx mcp-imagegen-server
```

For HTTP mode:

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

## Configuration

Runtime configuration is loaded in this order:

1. Environment variables
2. A JSON config file

Supported environment variables:

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`
- `IMAGEGEN_CONFIG_PATH`

Default config path:

```text
$XDG_CONFIG_HOME/mcp-imagegen-server/config.json
```

If `XDG_CONFIG_HOME` is not set, the fallback is:

```text
~/.config/mcp-imagegen-server/config.json
```

Example config file:

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "sk-...",
  "model": "gpt-image-2"
}
```

## Output Files

If `outputDir` is not provided, images are written under:

```text
$XDG_DATA_HOME/mcp-imagegen-server/images/<project-name>/
```

If `XDG_DATA_HOME` is not set, the fallback is:

```text
~/.local/share/mcp-imagegen-server/images/<project-name>/
```

If `projectName` is omitted, the server derives one from the current working directory when possible.

## Tool Inputs

Supported controls include:

- `size`: `1024x1024`, `1024 * 1024`, `1024×1024`, or `auto`
- `latencyMode="fast"` for lower-latency drafts
- `referenceImages` for reference-based generation
- `inputImages` plus optional `maskImage` for editing flows
- `timeoutMs` and `retryCount` for slow upstream gateways

## Generic stdio client example

Any MCP client that accepts a command-based server config can launch:

```json
{
  "command": "npx",
  "args": ["mcp-imagegen-server"]
}
```

## Development

Run tests:

```bash
npm test
```

Run the direct library smoke test:

```bash
npm run smoke-test
```

Run the MCP stdio smoke test:

```bash
npm run smoke-test:mcp
```

Both smoke tests call the configured upstream image API and may incur provider cost.
