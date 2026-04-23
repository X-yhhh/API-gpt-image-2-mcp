# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` is a public Model Context Protocol server for image generation and editing through an OpenAI-compatible image API.

Current release support:

- `v0.4.1` is the current cross-platform release baseline for macOS, Unix-like environments, and Windows local usage
- `main` is the only active release branch; old platform-specific `release/*` branches have been retired

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

Default config path on macOS and Linux:

```text
$XDG_CONFIG_HOME/mcp-imagegen-server/config.json
```

If `XDG_CONFIG_HOME` is not set, the fallback is:

```text
~/.config/mcp-imagegen-server/config.json
```

Default config path on Windows:

```text
%APPDATA%\mcp-imagegen-server\config.json
```

Example config file:

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "sk-...",
  "model": "gpt-image-2"
}
```

If you do not want to rely on the default config file path, you can pass runtime settings through the MCP client config with:

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`

## Output Files

If `outputDir` is not provided, images are written under this root on macOS and Linux:

```text
$XDG_DATA_HOME/mcp-imagegen-server/images/<project-name>/
```

If `XDG_DATA_HOME` is not set, the fallback is:

```text
~/.local/share/mcp-imagegen-server/images/<project-name>/
```

On Windows, the default output root is:

```text
%LOCALAPPDATA%\mcp-imagegen-server\images\<project-name>\
```

If `projectName` is omitted, the server derives one from the current working directory when possible.

## Tool Inputs

Supported controls include:

- `size`: custom dimensions such as `1536x1024`, `1536 * 1024`, `1536×1024`, or `auto`
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

For the client-specific examples below, prefer `node` plus an absolute `server.mjs` path. It is the most predictable setup across macOS, Linux, and Windows.

## Local MCP Setup

Recommended path:

1. Install the project.
2. Create `config.json` for the image gateway.
3. Add the server to your MCP client with `stdio`.
4. Restart the MCP client.
5. Verify `generate_image` and `edit_image` are available.

If you need a manual check first:

```bash
node /absolute/path/to/API-gpt-image-2-mcp/server.mjs --help
```

## Generic Client Config

Minimal local server:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
}
```

With explicit env:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"],
  "env": {
    "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
    "IMAGEGEN_API_KEY": "your-api-key",
    "IMAGEGEN_MODEL": "gpt-image-2"
  }
}
```

## Codex

Config file:

```text
macOS / Linux: ~/.codex/config.toml
Windows: %USERPROFILE%\.codex\config.toml
```

Minimal local server:

```toml
[mcp_servers.imagegen]
command = "node"
args = ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
```

With explicit env:

```toml
[mcp_servers.imagegen]
command = "node"
args = ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]

[mcp_servers.imagegen.env]
IMAGEGEN_BASE_URL = "https://your-gateway.example/v1"
IMAGEGEN_API_KEY = "your-api-key"
IMAGEGEN_MODEL = "gpt-image-2"
```

Equivalent CLI:

```bash
codex mcp add imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

With explicit env:

```bash
codex mcp add imagegen \
  --env IMAGEGEN_BASE_URL=https://your-gateway.example/v1 \
  --env IMAGEGEN_API_KEY=your-api-key \
  --env IMAGEGEN_MODEL=gpt-image-2 \
  -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

## Claude Code

Recommended config location:

```text
Project scope: .mcp.json
User scope: ~/.claude.json
Windows user scope: %USERPROFILE%\.claude.json
```

Recommended CLI setup:

```bash
claude mcp add --transport stdio imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

With explicit env:

```bash
claude mcp add --transport stdio \
  -e IMAGEGEN_BASE_URL=https://your-gateway.example/v1 \
  -e IMAGEGEN_API_KEY=your-api-key \
  -e IMAGEGEN_MODEL=gpt-image-2 \
  imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

Manual JSON config:

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "node",
      "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
    }
  }
}
```

With explicit env:

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "node",
      "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"],
      "env": {
        "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
        "IMAGEGEN_API_KEY": "your-api-key",
        "IMAGEGEN_MODEL": "gpt-image-2"
      }
    }
  }
}
```

## OpenClaw

Config file:

```text
macOS / Linux: ~/.openclaw/openclaw.json
Windows: %USERPROFILE%\.openclaw\openclaw.json
```

Minimal local server:

```json
{
  "mcp": {
    "servers": {
      "imagegen": {
        "command": "node",
        "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
      }
    }
  }
}
```

With explicit env:

```json
{
  "mcp": {
    "servers": {
      "imagegen": {
        "command": "node",
        "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"],
        "env": {
          "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
          "IMAGEGEN_API_KEY": "your-api-key",
          "IMAGEGEN_MODEL": "gpt-image-2"
        }
      }
    }
  }
}
```

## OpenCode

Recommended config location:

```text
Project scope: opencode.json
Global macOS / Linux: ~/.config/opencode/opencode.json
Global Windows: %USERPROFILE%\.config\opencode\opencode.json
```

Minimal local server:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "imagegen": {
      "type": "local",
      "command": ["node", "/absolute/path/to/API-gpt-image-2-mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

With explicit env:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "imagegen": {
      "type": "local",
      "command": ["node", "/absolute/path/to/API-gpt-image-2-mcp/server.mjs"],
      "enabled": true,
      "environment": {
        "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
        "IMAGEGEN_API_KEY": "your-api-key",
        "IMAGEGEN_MODEL": "gpt-image-2"
      }
    }
  }
}
```

## Platform Path Notes

macOS / Linux absolute server example:

```json
{
  "command": "/usr/local/bin/node",
  "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
}
```

Windows absolute server example:

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\path\\to\\API-gpt-image-2-mcp\\server.mjs"]
}
```

Restart the client after changing its MCP config.

## Verify the Integration

Try requests like these inside your client.

Generate an image:

```text
Generate a minimalist product photo of a white ceramic cup on a plain background.
```

Edit an image:

```text
Change the background of this image to solid white while keeping the subject shadow.
```

After setup, the MCP server exposes:

- `generate_image`
- `edit_image`

## Current Version

- `v0.4.1`: current and only documented public release baseline; future releases ship from `main` and use this baseline as version `1`

Release policy details: [Release Policy](./docs/release-policy.md)

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
