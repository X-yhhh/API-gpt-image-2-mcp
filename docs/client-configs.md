# Client Config Examples

`mcp-imagegen-server` uses one cross-platform `stdio` server entry. The MCP tools are the same on macOS, Linux, and Windows; only local paths differ.

Use the generic command when `mcp-imagegen-server` is installed or available through `npx`:

```json
{
  "command": "npx",
  "args": ["mcp-imagegen-server"]
}
```

For the client-specific examples below, prefer `node` plus an absolute `server.mjs` path. It is the most predictable setup across macOS, Linux, and Windows.

## Runtime Config

Recommended: store the API config in the server config file.

macOS / Linux:

```text
~/.config/mcp-imagegen-server/config.json
```

Windows:

```text
%APPDATA%\mcp-imagegen-server\config.json
```

Config content:

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "your-api-key",
  "model": "gpt-image-2"
}
```

Alternative: pass explicit env vars in the client config:

```json
{
  "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
  "IMAGEGEN_API_KEY": "your-api-key",
  "IMAGEGEN_MODEL": "gpt-image-2"
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

Claude Code can also use a JSON `mcpServers` object when you manage config manually:

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
