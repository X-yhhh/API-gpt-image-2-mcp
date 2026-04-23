# 客户端配置示例

`mcp-imagegen-server` 使用统一的跨平台 `stdio` server 配置。macOS、Linux、Windows 暴露的 MCP 工具相同，区别只在本地路径写法。

如果 `mcp-imagegen-server` 已安装，或客户端可以通过 `npx` 启动它，可以使用通用命令：

```json
{
  "command": "npx",
  "args": ["mcp-imagegen-server"]
}
```

下面的客户端专用示例统一推荐使用 `node + server.mjs`。这在 macOS、Linux、Windows 上最稳定，也更容易排查路径问题。

## 运行时配置

推荐方式：把图像 API 配置放在服务自己的配置文件里。

macOS / Linux：

```text
~/.config/mcp-imagegen-server/config.json
```

Windows：

```text
%APPDATA%\mcp-imagegen-server\config.json
```

配置内容：

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "your-api-key",
  "model": "gpt-image-2"
}
```

可选方式：直接在客户端 MCP 配置里传环境变量：

```json
{
  "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
  "IMAGEGEN_API_KEY": "your-api-key",
  "IMAGEGEN_MODEL": "gpt-image-2"
}
```

## Codex

配置文件：

```text
macOS / Linux：~/.codex/config.toml
Windows：%USERPROFILE%\.codex\config.toml
```

最小本地 server 配置：

```toml
[mcp_servers.imagegen]
command = "node"
args = ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
```

带显式环境变量：

```toml
[mcp_servers.imagegen]
command = "node"
args = ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]

[mcp_servers.imagegen.env]
IMAGEGEN_BASE_URL = "https://your-gateway.example/v1"
IMAGEGEN_API_KEY = "your-api-key"
IMAGEGEN_MODEL = "gpt-image-2"
```

等价 CLI：

```bash
codex mcp add imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

带显式环境变量：

```bash
codex mcp add imagegen \
  --env IMAGEGEN_BASE_URL=https://your-gateway.example/v1 \
  --env IMAGEGEN_API_KEY=your-api-key \
  --env IMAGEGEN_MODEL=gpt-image-2 \
  -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

## Claude Code

推荐配置位置：

```text
项目级：.mcp.json
用户级：~/.claude.json
Windows 用户级：%USERPROFILE%\.claude.json
```

推荐使用 CLI 添加：

```bash
claude mcp add --transport stdio imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

带显式环境变量：

```bash
claude mcp add --transport stdio \
  -e IMAGEGEN_BASE_URL=https://your-gateway.example/v1 \
  -e IMAGEGEN_API_KEY=your-api-key \
  -e IMAGEGEN_MODEL=gpt-image-2 \
  imagegen -- node /absolute/path/to/API-gpt-image-2-mcp/server.mjs
```

如果你手动维护 JSON 配置，也可以使用 `mcpServers`：

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

带显式环境变量：

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

配置文件：

```text
macOS / Linux：~/.openclaw/openclaw.json
Windows：%USERPROFILE%\.openclaw\openclaw.json
```

最小本地 server 配置：

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

带显式环境变量：

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

推荐配置位置：

```text
项目级：opencode.json
全局 macOS / Linux：~/.config/opencode/opencode.json
全局 Windows：%USERPROFILE%\.config\opencode\opencode.json
```

最小本地 server 配置：

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

带显式环境变量：

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

## 平台路径说明

macOS / Linux 绝对路径示例：

```json
{
  "command": "/usr/local/bin/node",
  "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
}
```

Windows 绝对路径示例：

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\path\\to\\API-gpt-image-2-mcp\\server.mjs"]
}
```

修改 MCP 配置后，请重启对应客户端。
