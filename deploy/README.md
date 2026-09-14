# Work Calendar 部署指南

本目录提供 Cloudflare Tunnel、Caddy、systemd 与备份的模板。生产环境建议让 Python 服务只监听 `127.0.0.1:4173`，再由 Tunnel 或反向代理转发，不直接暴露应用端口。

## 推荐：Cloudflare Tunnel

1. 在服务器安装 Python 3.11+ 与 `cloudflared`：

```bash
# macOS
brew install cloudflared
# Debian/Ubuntu 参见 Cloudflare 官方仓库；Windows 可用 winget install Cloudflare.cloudflared
```

2. 将项目复制到 `/opt/work-calendar`，创建专用用户 `workcalendar`，并确保 `data/` 可写。

3. 复制服务模板并替换其中的域名，然后启用：

```bash
sudo cp deploy/work-calendar.service.example /etc/systemd/system/work-calendar.service
# 编辑 Environment=WORK_CALENDAR_ORIGINS 为你的实际域名
sudo systemctl daemon-reload
sudo systemctl enable --now work-calendar
curl http://127.0.0.1:4173/api/health
```

4. 创建 Tunnel 并把域名路由到本机服务（`your-domain.example` 换成你的域名）：

```bash
cloudflared tunnel login
cloudflared tunnel create work-calendar
cloudflared tunnel route dns work-calendar work.your-domain.example
```

`cloudflared tunnel login` 会打开 Cloudflare 授权页，请使用拥有该域名的账号完成登录。授权文件与 Tunnel credentials 只保存在本机，不要提交到项目目录。

将 `cloudflared-config.yml.example` 复制为 `/etc/cloudflared/config.yml`，填入实际 Tunnel ID 与域名，然后：

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Cloudflare DNS 中只保留 Tunnel 创建的记录，不要再为同一主机名配置冲突的 A 记录。子域名（如 `work.your-domain.example`）需要同步修改 `WORK_CALENDAR_ORIGINS`。

## 传统反向代理

也可以使用 Caddy/Nginx：Cloudflare DNS 的 A/AAAA 记录指向服务器，反向代理转发到 `127.0.0.1:4173`。Caddy 会自动申请证书（见 `Caddyfile.example`）；使用 Nginx 时请配置 HTTPS 和常规代理头（当前应用不依赖 WebSocket）。

## Windows 部署

### 本机安装

在解压目录右键选择“使用 PowerShell 运行”，或执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1
```

脚本会复制到 `%LOCALAPPDATA%\WorkCalendar`、通过 winget 安装 Python 3.12（如尚未安装）、注册并启动“Work Calendar”登录启动任务。默认本机地址为 `http://127.0.0.1:4173/`，不依赖 cloudflared。

### 搭配 Cloudflare Tunnel

1. 安装 `cloudflared`（`winget install Cloudflare.cloudflared`）。
2. 将 `windows-config.yml.example` 复制为 `%USERPROFILE%\.cloudflared\config.yml`，填入 Tunnel ID 与域名，并把该 Tunnel 的 credentials JSON 放到同一目录。不要把 `cert.pem`、credentials JSON 或 API Key 放进项目目录或公开上传。
3. 以“管理员身份”打开 PowerShell，从项目目录运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\install-windows-tasks.ps1
```

脚本会注册两个登录启动任务：`Work Calendar` 和 `Work Calendar Cloudflare Tunnel`。应用通过 `run-windows.ps1` 读取 `WORK_CALENDAR_ORIGINS` 并启用 Secure Cookie，默认值为占位域名，请替换为你的实际域名（也可在环境中预先设置该变量）。

4. 确认本机 `http://127.0.0.1:4173/api/health` 返回 `200`，再访问你的域名验证首页、登录和状态 API。

同一套 SQLite 数据只应被一台机器写入；迁移时先停止旧实例、复制一次数据库，确认新实例正常后再停用旧实例，避免数据分叉。

## 安全与数据

- `WORK_CALENDAR_ORIGINS` 必须填写实际 `https://` 域名，多个域名用逗号分隔。
- `WORK_CALENDAR_SECURE_COOKIE=1` 只在 HTTPS 访问时启用。
- 不要公开 `data/initial-accounts.txt` 或 SQLite 文件；建议将 `data/` 权限设为 `700`、数据库设为 `600`。
- 定期备份 `data/work-calendar.sqlite3`。API Key 保存在服务端数据库，不会返回给成员端。
- 可将 `backup.sh.example` 配置为每日 cron/systemd timer，使用 SQLite 在线备份并保留最近 14 天。
