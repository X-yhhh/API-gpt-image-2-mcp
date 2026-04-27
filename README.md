# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` is a local-first Model Context Protocol server for image generation and editing through an OpenAI-compatible image API. The recommended transport is `stdio` for local MCP clients; streamable HTTP is retained as an advanced compatibility mode for hosted or remote deployments.

Current release support:

- `v0.4.2` is the current cross-platform release baseline for macOS, Unix-like environments, and Windows local usage
- `main` is the only active release branch; old platform-specific `release/*` branches have been retired

It exposes three MCP tools:

- `generate_image`
- `edit_image`
- `check_image_job`

The server supports two transports:

- `stdio` transport for local MCP clients. This is the default and recommended mode.
- streamable HTTP transport for advanced or compatibility deployments. HTTP mode has stricter input and output boundaries.

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

For advanced HTTP mode:

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

To require a bearer token for HTTP clients in advanced HTTP mode:

```bash
IMAGEGEN_MCP_AUTH_TOKEN=replace-with-a-random-token \
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
- `IMAGEGEN_MCP_AUTH_TOKEN` for protecting the HTTP MCP endpoint with `Authorization: Bearer <token>`
- `IMAGEGEN_MCP_SYNC_WAIT_MS` for limiting how long `generate_image` and `edit_image` wait before returning a background job ID

Credential boundaries:

- `IMAGEGEN_API_KEY` is the upstream image gateway credential used by this server when calling the OpenAI-compatible image API.
- `IMAGEGEN_MCP_AUTH_TOKEN` is a separate credential for authenticating MCP HTTP clients to this server. It does not replace the upstream image gateway key.

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

## Transport Differences

`stdio` is local-first and keeps the full local workflow:

- Accepts local file paths, base64 `data:` URLs, and public `http/https` URLs for reference images and masks.
- Allows `outputDir` for explicit local output placement.
- Writes generated files to the requested `outputDir` or the managed image data root.

HTTP mode is intentionally narrower:

- Accepts only base64 `data:` URLs and public `http/https` URLs for `referenceImages`, `inputImages`, and `maskImage`.
- Rejects local file paths.
- Rejects `outputDir`; use `projectName` and `filename` only. Output always stays under the managed image data root.
- Rejects request bodies larger than 20 MiB with HTTP `413` and a JSON-RPC style error body.
- Downloads remote image URLs only after public-address validation, follows at most 3 redirects, limits each remote image to 20 MiB, and applies a 15 second download timeout.

Remote URL validation applies to every redirect hop. The server rejects non-HTTP schemes, URLs with embedded usernames or passwords, localhost-style names, and DNS results that point to loopback, private, link-local, ULA, multicast, reserved, or documentation address ranges.

## Output Files

In `stdio` mode, you may pass `outputDir` to choose an explicit local output directory. If `outputDir` is not provided, images are written under this root on macOS and Linux:

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

If `projectName` is omitted, the server derives one from the current working directory when possible. In HTTP mode, `outputDir` is not accepted; `projectName` and `filename` are the only output path controls.

## Tool Inputs

Supported controls include:

- `size`: custom dimensions such as `1536x1024`, `1536 * 1024`, `1536×1024`, or `auto`
- `latencyMode="fast"` for lower-latency drafts
- `referenceImages` for reference-based generation
- `inputImages` plus optional `maskImage` for editing flows
- `projectName` and `filename` for managed output naming
- `outputDir` for local `stdio` use only
- `timeoutMs` and `retryCount` for slow upstream gateways

Long-running image calls are protected from MCP client-side call timeouts. By default, `generate_image` and `edit_image` wait for a bounded period; if the upstream gateway is still working, the tool returns a `Job ID` instead of failing. Call `check_image_job` with that ID to retrieve the result after the image is saved. `IMAGEGEN_MCP_SYNC_WAIT_MS` can lower this wait during testing or tune it for clients with shorter MCP timeouts.

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
5. Verify `generate_image`, `edit_image`, and `check_image_job` are available.

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
- `check_image_job`

## Current Version

- `v0.4.2`: current and only documented public release baseline; future releases ship from `main` and use this baseline as version `1`

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
