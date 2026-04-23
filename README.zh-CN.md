# mcp-imagegen-server

[English](./README.md) | [简体中文](./README.zh-CN.md)

`mcp-imagegen-server` 是一个公开的 Model Context Protocol 服务端，用于通过兼容 OpenAI 的图像 API 进行图片生成与编辑。

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

如果你是要接入本地 MCP 客户端，详细说明见：

- [Local MCP Setup Guide](./docs/local-mcp-setup.md)
- [本地 MCP 接入教程](./docs/local-mcp-setup.zh-CN.md)

本地运行：

```bash
npx mcp-imagegen-server
```

HTTP 模式运行：

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

当服务以 HTTP 模式运行时，可通过以下地址打开轻量配置页面：

```text
http://127.0.0.1:3000/ui
```

该页面会直接读取和写回服务实际使用的 `config.json`。如果设置了任意 `IMAGEGEN_*` 环境变量，页面会提示当前运行值正在被环境变量覆盖。

### 本地可视化配置流程

如果你希望通过浏览器页面来配置本地 MCP，而不是手动编辑 JSON，可以按下面的流程操作：

1. 先临时以 HTTP 模式启动一次服务：

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

2. 打开：

```text
http://127.0.0.1:3000/ui
```

3. 填写 `Base URL`、`API Key` 和 `Model`，然后点击 `Save config`
4. 保存完成后停止这个 HTTP 服务
5. 最终在你的 MCP 客户端里仍然按普通 `stdio` 方式接入

这个页面本身仍然是本地使用场景。页面里显示的配置路径，指的是“当前运行服务的这台机器”的路径。

## 配置

运行时配置按以下顺序加载：

1. 环境变量
2. JSON 配置文件

支持的环境变量：

- `IMAGEGEN_BASE_URL`
- `IMAGEGEN_API_KEY`
- `IMAGEGEN_MODEL`
- `IMAGEGEN_CONFIG_PATH`

默认配置文件路径：

```text
$XDG_CONFIG_HOME/mcp-imagegen-server/config.json
```

如果未设置 `XDG_CONFIG_HOME`，则回退为：

```text
~/.config/mcp-imagegen-server/config.json
```

配置文件示例：

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "sk-...",
  "model": "gpt-image-2"
}
```

## 输出文件

如果未提供 `outputDir`，图片会写入：

```text
$XDG_DATA_HOME/mcp-imagegen-server/images/<project-name>/
```

如果未设置 `XDG_DATA_HOME`，则回退为：

```text
~/.local/share/mcp-imagegen-server/images/<project-name>/
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
