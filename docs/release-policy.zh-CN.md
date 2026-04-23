# 发布策略

`v0.4.1` 是 `mcp-imagegen-server` 当前的公开发布基线。

## 活跃发布线

- `main` 是唯一活跃开发和发布分支。
- 发布 tag 是已发布版本的事实来源。
- 除非实现层确实必须按操作系统分叉，否则不要再创建长期平台专用发布分支。

## 已退役分支

在统一跨平台的 `v0.4.1` 发布后，旧的平台专用发布分支已经退役。

不要再为常规补丁重建或推进 `release/macos-*`、`release/windows-*`。跨平台修复应进入 `main`，然后发布新的 tag。

## 当前版本

- `v0.4.1`：当前公开发布基线
- 后续版本统一从 `main` 延续，并以 `v0.4.1` 作为版本 `1` 的起点

## 发布检查清单

打 tag 前需要完成：

1. 更新 package 版本和 MCP server 自报版本。
2. 运行 `npm test`。
3. 如果有上游 API 凭据，运行直接库层 smoke test。
4. 如果有上游 API 凭据，运行 MCP stdio smoke test。
5. 确认 CI 在 Linux、macOS、Windows 上通过。
6. 从 `main` 打 tag。
