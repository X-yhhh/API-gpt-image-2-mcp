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

## Quick Start

Install dependencies:

```bash
npm install
```

Run the local setup command:

```bash
npx mcp-imagegen-server --configure
```

The configure flow does three things:

1. asks for `Base URL`, `API Key`, and optional `Model`
2. saves the runtime config file
3. automatically detects the current MCP client environment and installs the matching server config

Supported automatic targets:

- Codex
- Claude Code
- OpenCode
- OpenClaw
- fallback generic MCP JSON config when no supported client is detected, or when the local environment is ambiguous

After configuration completes, restart your MCP client and call `generate_image` or `edit_image`.

For full local setup instructions, see:

- [Local MCP Setup Guide](./docs/local-mcp-setup.md)
- [本地 MCP 接入教程](./docs/local-mcp-setup.zh-CN.md)

## Runtime Configuration

Runtime configuration is loaded in this order:

1. Environment variables
2. A JSON config file

Supported environment variables:

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`
- `IMAGEGEN_CONFIG_PATH`

Default config path on macOS / Linux:

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

The server refuses to start in `stdio` mode until `baseUrl` and `apiKey` are configured. If they are missing, it tells the user to run `npx mcp-imagegen-server --configure`.

## Automatic Client Integration

The project no longer exposes a frontend setup page and no longer asks the user to manually pick a client-specific config template.

Instead, `--configure` auto-detects the environment and writes the matching MCP server definition:

- Codex: updates `~/.codex/config.toml`
- Claude Code: updates project `.mcp.json`
- OpenCode: updates project `opencode.json`
- OpenClaw: updates project `openclaw.json`
- Generic fallback: writes project `.mcp.json` when no supported client is detected or when multiple clients are detectable without a clear winner

## Windows Notes

PowerShell users can run the configure flow with:

```powershell
.\start-configure.ps1
```

PowerShell users can start the HTTP transport with:

```powershell
.\start-http.ps1 -BindHost 127.0.0.1 -Port 3000
```

The script intentionally uses `-BindHost`, not `-Host`, because `$Host` is a built-in PowerShell variable.

## Output Files

If `outputDir` is not provided, images are written under:

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

## Verification

Only verify after runtime config is saved.

```bash
npm run smoke-test
npm run smoke-test:mcp
```

Both smoke tests call the configured upstream image API and may incur provider cost. Do not use empty requests as a health check; they can fail because the request body is incomplete and do not validate MCP setup.

## Development

Run local tests:

```bash
npm test
```
