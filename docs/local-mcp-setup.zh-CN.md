# 本地 MCP 接入教程

本教程说明如何从本地仓库接入和使用 `mcp-imagegen-server`，不再依赖任何前端配置页面。

英文版见 [Local MCP Setup Guide](./local-mcp-setup.md)。

## 1. 环境要求

请先确保本机具备：

- Node.js 20 或更高版本
- 一个可访问的图像 API 网关，并支持：
  - `POST /images/generations`
  - `POST /images/edits`

## 2. 克隆项目并安装依赖

```bash
git clone git@github.com:X-yhhh/API-gpt-image-2-mcp.git
cd API-gpt-image-2-mcp
npm install
```

## 3. 运行配置命令

在连接任何 MCP 客户端、运行任何 smoke test 之前，先执行：

```bash
npx mcp-imagegen-server --configure
```

Windows PowerShell 下也可以直接运行：

```powershell
.\start-configure.ps1
```

这个命令会自动完成：

1. 询问 `Base URL`
2. 询问 `API Key`
3. 询问可选的 `Model`
4. 保存运行时配置文件
5. 自动识别本地 MCP 客户端环境
6. 自动安装对应的 MCP 服务配置

## 4. 自动环境处理

现在不需要再手动选择配置格式。

配置流程会自动命中以下目标之一：

- Codex
- Claude Code
- OpenCode
- OpenClaw
- 如果没有明确命中，或者本地环境存在歧义，则回退到通用 MCP JSON 配置

## 5. 重启客户端

`--configure` 完成后，重启你的 MCP 客户端，让它重新加载服务定义。

## 6. 完成配置后的可选验证

在 `Base URL` 和 `API Key` 已经保存之后，你可以按下面任意一种方式验证：

1. 直接让 MCP 客户端调用一次带真实 prompt 的 `generate_image`
2. 运行库层 smoke test：

```bash
npm run smoke-test
```

3. 运行 MCP stdio smoke test：

```bash
npm run smoke-test:mcp
```

不要通过发送空请求或不完整请求来验证接入是否成功。这类请求很容易因为缺少 `prompt` 等业务参数而失败，不能证明 MCP 链路真的正确。

## 7. 使用说明

- 本地接入通常保持 `stdio` 即可。
- Windows PowerShell 下如果需要手动启动 HTTP 传输，请使用 `.\start-http.ps1 -BindHost 127.0.0.1 -Port 3000`。不要把参数改成 `Host`，因为 `$Host` 是 PowerShell 保留的内置变量。
- `size` 支持自定义尺寸，例如：
  - `1536x1024`
  - `1536 * 1024`
  - `1536×1024`
  - `auto`
- 如果启动失败，请优先检查：
  - `node` 路径是否正确
  - `server.mjs` 是否使用绝对路径
  - 配置命令是否执行成功
  - `baseUrl` 是否真的可访问

## 8. 可选：手动检查脚本是否可启动

可以先手动验证脚本本身是否能正常启动：

```bash
node /绝对路径/API-gpt-image-2-mcp/server.mjs --help
```
