# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` 是一个公开的 Model Context Protocol 服务端，用于通过兼容 OpenAI 的图像 API 进行图片生成与编辑。

当前版本支持范围：

- `v0.4.1+` 是统一的跨平台发布线，正式支持 macOS、类 Unix 环境以及 Windows 下的本地使用
- `main` 是唯一活跃发布分支；旧的平台专用 `release/*` 分支已经退役

它暴露了两个 MCP 工具：

- `generate_image`
- `edit_image`

服务同时支持：

- 面向本地 MCP 客户端的 `stdio` 传输
- 面向托管或远程部署场景的可流式 HTTP 传输

## 环境要求

- Node.js 20 或更高版本
- 可访问一个兼容 OpenAI 的图像接口，并支持：
  - `POST /images/generations`
  - `POST /images/edits`

## 安装

```bash
npm install
```

本地运行：

```bash
npx mcp-imagegen-server
```

HTTP 模式运行：

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

## 配置

运行时配置按以下顺序加载：

1. 环境变量
2. JSON 配置文件

支持的环境变量：

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`
- `IMAGEGEN_CONFIG_PATH`

macOS / Linux 默认配置文件路径：

```text
$XDG_CONFIG_HOME/mcp-imagegen-server/config.json
```

如果未设置 `XDG_CONFIG_HOME`，则回退为：

```text
~/.config/mcp-imagegen-server/config.json
```

Windows 默认配置文件路径：

```text
%APPDATA%\mcp-imagegen-server\config.json
```

配置文件示例：

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "sk-...",
  "model": "gpt-image-2"
}
```

如果你不想依赖默认配置文件路径，也可以在 MCP 客户端配置里传这些环境变量：

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`

## 输出文件

如果未提供 `outputDir`，macOS / Linux 下图片默认会写入：

```text
$XDG_DATA_HOME/mcp-imagegen-server/images/<project-name>/
```

如果未设置 `XDG_DATA_HOME`，则回退为：

```text
~/.local/share/mcp-imagegen-server/images/<project-name>/
```

Windows 下默认输出根目录为：

```text
%LOCALAPPDATA%\mcp-imagegen-server\images\<project-name>\
```

如果省略 `projectName`，服务会在可能的情况下根据当前工作目录自动推导项目名。

## 工具输入

支持的常用控制项包括：

- `size`：支持自定义尺寸，例如 `1536x1024`、`1536 * 1024`、`1536×1024`，或 `auto`
- `latencyMode="fast"`：用于低时延草稿生成
- `referenceImages`：用于参考图驱动的生成
- `inputImages` 以及可选的 `maskImage`：用于编辑流程
- `timeoutMs` 与 `retryCount`：用于慢速上游网关场景

## 通用 stdio 客户端示例

任何支持以命令方式启动 MCP 服务的客户端，都可以这样配置：

```json
{
  "command": "npx",
  "args": ["mcp-imagegen-server"]
}
```

下面的客户端专用示例统一推荐使用 `node + server.mjs`。这在 macOS、Linux、Windows 上最稳定，也更容易排查路径问题。

## 本地 MCP 接入

推荐路径：

1. 安装项目。
2. 创建图像网关配置文件 `config.json`。
3. 在 MCP 客户端里用 `stdio` 方式添加服务。
4. 重启 MCP 客户端。
5. 验证 `generate_image` 和 `edit_image` 已经出现。

如果你想先手动确认脚本能启动：

```bash
node /absolute/path/to/API-gpt-image-2-mcp/server.mjs --help
```

## 通用客户端配置

最小本地 server 配置：

```json
{
  "command": "node",
  "args": ["/absolute/path/to/API-gpt-image-2-mcp/server.mjs"]
}
```

带显式环境变量：

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

手动 JSON 配置：

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

## 验证接入

可以在客户端里尝试类似下面的请求。

生成图片：

```text
请生成一张极简风格的白色陶瓷杯产品图，纯色背景。
```

编辑图片：

```text
请把这张图片背景改成纯白，并保留主体阴影。
```

接入成功后，服务会暴露以下工具：

- `generate_image`
- `edit_image`

## 版本历史

- `v0.3.0`：面向 macOS / 类 Unix 的历史发布线
- `v0.4.0`：首次补齐 Windows 本地路径支持的发布线
- `v0.4.1`：第一个统一的跨平台发布基线；后续版本统一从 `main` 发布，并以 tag 作为版本事实来源

发布策略说明见：[发布策略](./docs/release-policy.zh-CN.md)

## 开发

运行测试：

```bash
npm test
```

运行直接库层 smoke test：

```bash
npm run smoke-test
```

运行 MCP stdio smoke test：

```bash
npm run smoke-test:mcp
```

以上两个 smoke test 都会调用已配置的上游图像 API，可能产生供应商费用。
