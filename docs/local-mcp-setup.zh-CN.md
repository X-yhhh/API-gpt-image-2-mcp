# 本地 MCP 接入教程

本教程说明普通用户如何在本地接入和使用 `mcp-imagegen-server`。

英文版见 [English version](./local-mcp-setup.md)。

本教程当前面向 macOS 与类 Unix shell。Windows 接入说明将在 `v0.4.0` 中补齐。

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

## 3. 配置图像接口

推荐使用配置文件方式。

先创建配置目录：

```bash
mkdir -p ~/.config/mcp-imagegen-server
```

然后创建这个文件：

```text
~/.config/mcp-imagegen-server/config.json
```

示例内容：

```json
{
  "baseUrl": "https://your-gateway.example/v1",
  "apiKey": "your-api-key",
  "model": "gpt-image-2"
}
```

### 可选：通过内置本地页面完成配置

如果你不想手动编辑 JSON，也可以临时把服务以 HTTP 模式启动一次，然后用内置页面完成配置：

```bash
npx mcp-imagegen-server --transport http --host 127.0.0.1 --port 3000
```

接着打开：

```text
http://127.0.0.1:3000/ui
```

在页面里填写并保存 `Base URL`、`API Key` 和 `Model`，它会直接写入本地真实配置文件。保存完成后，关闭这个 HTTP 服务，再继续按下面的普通本地 `stdio` 方式接入即可。

页面里显示的配置路径，始终对应“当前运行这个服务的机器”的本地路径。

## 4. 把 MCP 服务添加到本地客户端

本地使用时请走默认的 `stdio` 传输，不需要额外加 `--transport http`。

在你的 MCP 客户端配置中加入类似下面的服务定义：

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "node",
      "args": ["/绝对路径/API-gpt-image-2-mcp/server.mjs"]
    }
  }
}
```

如果你的环境里 `node` 不在 PATH 中，请改成 Node 的绝对路径：

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "/绝对路径/node",
      "args": ["/绝对路径/API-gpt-image-2-mcp/server.mjs"]
    }
  }
}
```

## 5. 可选方式：使用环境变量配置

如果你不想依赖默认配置文件路径，也可以直接在客户端配置里传运行时环境变量：

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "node",
      "args": ["/绝对路径/API-gpt-image-2-mcp/server.mjs"],
      "env": {
        "IMAGEGEN_BASE_URL": "https://your-gateway.example/v1",
        "IMAGEGEN_API_KEY": "your-api-key",
        "IMAGEGEN_MODEL": "gpt-image-2"
      }
    }
  }
}
```

## 6. 重启 MCP 客户端

保存配置后，重启你的 MCP 客户端，让它重新加载服务定义。

## 7. 验证是否接入成功

可以在客户端里尝试类似下面的请求。

生成图片：

```text
请生成一张极简风格的白色陶瓷杯产品图，纯色背景。
```

编辑图片：

```text
请把这张图片背景改成纯白，并保留主体阴影。
```

## 8. 可用工具

接入成功后，服务会暴露以下工具：

- `generate_image`
- `edit_image`

## 9. 使用说明

- 本地接入通常保持 `stdio` 即可。
- `size` 支持自定义尺寸，例如：
  - `1536x1024`
  - `1536 * 1024`
  - `1536×1024`
  - `auto`
- 如果启动失败，请优先检查：
  - `node` 路径是否正确
  - `server.mjs` 是否使用绝对路径
  - `config.json` 或环境变量是否填写正确
  - `baseUrl` 是否真的可访问

## 10. 可选：手动检查脚本是否可启动

可以先手动验证脚本本身是否能正常启动：

```bash
node /绝对路径/API-gpt-image-2-mcp/server.mjs --help
```
