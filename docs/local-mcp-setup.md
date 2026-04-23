# Local MCP Setup Guide

This guide explains how a normal user can configure `mcp-imagegen-server` for local use.

For Chinese instructions, see [README.zh-CN](./local-mcp-setup.zh-CN.md).

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

## 3. Configure the image API

Using a config file is the recommended approach.

Create the config directory:

```bash
mkdir -p ~/.config/mcp-imagegen-server
```

Create this file:

```text
~/.config/mcp-imagegen-server/config.json
```

Example:

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "your-api-key",
  "model": "gpt-image-2"
}
```

## 4. Add the MCP server to your local client

For local usage, use the default `stdio` transport. Do not add `--transport http`.

Add a server entry like this to your MCP client config:

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

If `node` is not available in your PATH, use its absolute path instead:

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
    }
  }
}
```

## 5. Alternative: configure through environment variables

If you do not want to rely on the default config file path, you can provide runtime settings directly:

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

## 6. Restart the MCP client

After saving the config, restart your MCP client so it reloads the server definition.

## 7. Verify the integration

Try requests like these inside your client.

Generate an image:

```text
Generate a minimalist product photo of a white ceramic cup on a plain background.
```

Edit an image:

```text
Change the background of this image to solid white while keeping the subject shadow.
```

## 8. Available tools

After setup, the MCP server exposes:

- `generate_image`
- `edit_image`

## 9. Notes

- Local usage should normally stay on `stdio`.
- `size` supports custom dimensions such as:
  - `1536x1024`
  - `1536 * 1024`
  - `1536×1024`
  - `auto`
- If startup fails, check:
  - whether `node` is correct
  - whether `server.mjs` uses an absolute path
  - whether your `config.json` or environment variables are valid
  - whether `baseUrl` is reachable

## 10. Optional manual check

You can verify the script itself starts correctly:

```bash
node /absolute/path/to/API-gpt-image-2-mcp/server.mjs --help
```
