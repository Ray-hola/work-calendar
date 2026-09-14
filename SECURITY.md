# 安全策略

## 报告安全问题

如果你发现了安全漏洞，请不要公开提交 Issue。请通过以下方式私下联系维护者：

- 使用 GitHub 的 [Private vulnerability reporting](../../security/advisories/new)（推荐），或
- 通过仓库主页公开的邮箱联系维护者。

请在报告中包含：受影响的版本或提交、复现步骤、影响范围，以及你建议的缓解方式（如有）。我们会尽快确认并回复。

## 部署注意事项

Work Calendar 默认面向本机或受信任的小型团队使用，请在生产部署时注意：

- 服务只应监听 `127.0.0.1`，由 Cloudflare Tunnel 或反向代理对外发布，不要直接暴露应用端口。
- 通过 HTTPS 访问时必须设置 `WORK_CALENDAR_ORIGINS` 为实际域名，并启用 `WORK_CALENDAR_SECURE_COOKIE=1`。
- 将 `data/` 目录权限设为 `700`，SQLite 与 WAL 文件设为 `600`；`data/initial-accounts.txt` 含明文初始密码，首次登录后请修改密码并妥善保管或删除。
- 定期备份数据库；不要将数据库、账户文件、Tunnel 凭证或 API Key 提交到版本库。
- 嵌入式 AI 助手的 API Key 仅保存在服务端数据库，由管理员配置，不会返回给普通成员。

## 支持范围

安全修复会应用于默认分支的最新版本。请在复现问题前确认使用的是最新代码。
