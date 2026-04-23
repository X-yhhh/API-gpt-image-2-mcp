# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` 是一个公开的 Model Context Protocol 服务端，用于通过兼容 OpenAI 的图像 API 进行图片生成与编辑。

它暴露两个 MCP 工具：

- `generate_image`
- `edit_image`

服务支持：

- 面向本地 MCP 客户端的 `stdio` 传输
- 面向托管或远程部署场景的可流式 HTTP 传输

## 环境要求

- Node.js 20 或更高版本
- 可访问一个兼容 OpenAI 的图像接口，并支持：
  - `POST /images/generations`
  - `POST /images/edits`

## 快速开始

先安装依赖：

```bash
npm install
```

然后运行本地配置命令：

```bash
npx mcp-imagegen-server --configure
```

这个配置流程会自动完成三件事：

1. 询问 `Base URL`、`API Key` 和可选的 `Model`
2. 保存运行时配置文件
3. 自动识别当前 MCP 客户端环境，并写入对应的服务配置

当前支持的自动目标：

- Codex
- Claude Code
- OpenCode
- OpenClaw
- 如果都没识别到，或者本地环境存在歧义，则回退为通用 MCP JSON 配置

配置完成后，重启你的 MCP 客户端，再调用 `generate_image` 或 `edit_image`。

完整本地接入说明见：

- [Local MCP Setup Guide](./docs/local-mcp-setup.md)
- [本地 MCP 接入教程](./docs/local-mcp-setup.zh-CN.md)

## 运行时配置

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

在 `stdio` 模式下，如果还没有配置 `baseUrl` 和 `apiKey`，服务会拒绝启动，并提示先运行 `npx mcp-imagegen-server --configure`。

## 自动客户端集成

项目已经删除前端配置页面，也不再让用户手动选择客户端配置模板。

现在由 `--configure` 自动识别环境并写入对应的 MCP 服务定义：

- Codex：更新 `~/.codex/config.toml`
- Claude Code：更新项目内 `.mcp.json`
- OpenCode：更新项目内 `opencode.json`
- OpenClaw：更新项目内 `openclaw.json`
- 通用回退：在没有明确命中目标客户端，或同时检测到多个候选客户端时，写入项目内 `.mcp.json`

## Windows 说明

PowerShell 用户可以这样执行配置流程：

```powershell
.\start-configure.ps1
```

PowerShell 用户可以这样启动 HTTP 传输：

```powershell
.\start-http.ps1 -BindHost 127.0.0.1 -Port 3000
```

脚本有意使用 `-BindHost`，而不是 `-Host`，因为 `$Host` 是 PowerShell 内置变量。

## 输出文件

如果未提供 `outputDir`，图片默认会写入：

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

## 验证

只有在运行时配置已经保存之后，才建议验证：

```bash
npm run smoke-test
npm run smoke-test:mcp
```

以上两个 smoke test 都会调用已配置的上游图像 API，可能产生供应商费用。不要用空请求作为健康检查；空请求会因为请求体不完整而失败，不能证明 MCP 配置正确。

## 开发

运行本地测试：

```bash
npm test
```
