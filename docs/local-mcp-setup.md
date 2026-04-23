# Local MCP Setup Guide

This guide explains how to connect `mcp-imagegen-server` from a local checkout without any frontend setup page.

For Chinese instructions, see [本地 MCP 接入教程](./local-mcp-setup.zh-CN.md).

## 1. Prerequisites

Make sure your machine has:

- Node.js 20 or newer
- Access to an image API gateway that supports:
  - `POST /images/generations`
  - `POST /images/edits`

## 2. Clone and install

```bash
git clone git@github.com:X-yhhh/API-gpt-image-2-mcp.git
cd API-gpt-image-2-mcp
npm install
```

## 3. Run the configure command

Before connecting any MCP client or running any smoke test, run:

```bash
npx mcp-imagegen-server --configure
```

On Windows PowerShell, you can use:

```powershell
.\start-configure.ps1
```

The command will:

1. ask for `Base URL`
2. ask for `API Key`
3. ask for optional `Model`
4. save the runtime config file
5. auto-detect the local MCP client environment
6. install the correct MCP server definition automatically

## 4. Automatic environment handling

You do not need to manually choose a config format anymore.

The configure flow will automatically target one of:

- Codex
- Claude Code
- OpenCode
- OpenClaw
- generic MCP JSON fallback when no supported client is detected or when the local environment is ambiguous

## 5. Restart the client

After `--configure` finishes, restart your MCP client so it reloads the server definition.

## 6. Optional verification after configuration

After `Base URL` and `API Key` are saved, you can verify the integration in one of these ways:

1. Ask your MCP client to call `generate_image` with a real prompt.
2. Run the library smoke test:

```bash
npm run smoke-test
```

3. Run the MCP stdio smoke test:

```bash
npm run smoke-test:mcp
```

Do not validate the integration by sending an empty or incomplete request. That can fail for the wrong reason, such as a missing prompt, and does not prove the MCP wiring is correct.

## 7. Notes

- Local usage should normally stay on `stdio`.
- On Windows PowerShell, use `.\start-http.ps1 -BindHost 127.0.0.1 -Port 3000` if you need to start HTTP transport manually. Do not rename the parameter to `Host`; `$Host` is reserved by PowerShell.
- `size` supports custom dimensions such as:
  - `1536x1024`
  - `1536 * 1024`
  - `1536×1024`
  - `auto`
- If startup fails, check:
  - whether `node` is correct
  - whether `server.mjs` uses an absolute path
  - whether the configure command completed successfully
  - whether `baseUrl` is reachable

## 8. Optional manual check

You can verify the script itself starts correctly:

```bash
node /absolute/path/to/API-gpt-image-2-mcp/server.mjs --help
```
