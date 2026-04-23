# 发布策略

`v0.4.1` 是 `mcp-imagegen-server` 的第一个统一跨平台发布基线。

## 活跃发布线

- `main` 是唯一活跃开发和发布分支。
- 发布 tag 是已发布版本的事实来源。
- 除非实现层确实必须按操作系统分叉，否则不要再创建长期平台专用发布分支。

## 历史分支

以下分支仅作为旧版本的只读参考保留：

- `release/macos-v0.3.0`：面向 macOS / 类 Unix 的历史发布线
- `release/windows-v0.4.0`：补齐 Windows 支持的历史发布线

常规补丁不要继续推进这些分支。跨平台修复应进入 `main`，然后发布新的 tag。

## 版本历史

- `v0.3.0`：面向 macOS / 类 Unix 的历史发布线
- `v0.4.0`：首次补齐 Windows 本地路径支持的发布线
- `v0.4.1`：第一个统一跨平台发布基线

## 发布检查清单

打 tag 前需要完成：

1. 更新 package 版本和 MCP server 自报版本。
2. 运行 `npm test`。
3. 如果有上游 API 凭据，运行直接库层 smoke test。
4. 如果有上游 API 凭据，运行 MCP stdio smoke test。
5. 确认 CI 在 Linux、macOS、Windows 上通过。
6. 从 `main` 打 tag。
