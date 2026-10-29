# Work Calendar 部署指南

本目录提供 Docker Compose、Cloudflare Tunnel、Caddy、systemd 与备份的模板。生产环境建议让服务只监听本机回环地址，再由 Tunnel 或反向代理转发，不直接暴露应用端口。

## Docker

仓库根目录的 `Dockerfile` 只打包 `server.py`、`app.js`、`index.html`、`styles.css` 四个文件，数据写在容器的 `/app/data`。从仓库根目录启动：

```bash
docker compose -f deploy/docker-compose.example.yml up -d --build
curl http://127.0.0.1:4173/api/health
```

- 数据库与 `initial-accounts.txt` 落在仓库的 `data/`（compose 把它挂到 `/app/data`），升级镜像不会丢数据。
- 通过 https 对外服务时，在 compose 里填 `WORK_CALENDAR_ORIGINS` 并把 `WORK_CALENDAR_SECURE_COOKIE` 改为 `"1"`；文件末尾有注释掉的 Cloudflare Tunnel 服务，Tunnel 的 ingress 指向 `http://app:4173`。
- 更新：拉取新代码后再次执行 `up -d --build`。改过前端文件时记得同步 `index.html` 里的 `?v=` 版本号。
- 备份：容器运行时直接用 SQLite 在线备份，例如 `docker compose -f deploy/docker-compose.example.yml exec app python -c "import sqlite3; sqlite3.connect('/app/data/work-calendar.sqlite3').backup(sqlite3.connect('/app/data/backup.sqlite3'))"`，或参考下文的 `backup.sh.example`。

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

- `WORK_CALENDAR_ORIGINS` 必须填写实际 `https://` 域名，多个域名用逗号分隔——**每个真正对外服务的 hostname 都要写进去**（例如同时服务根域和 `www` 时两个都填）。
  **留成占位域名不会报任何错**：首页与 `GET /api/health` 照常 200，但浏览器发出的每个 `POST` 都会 403 `请求来源不匹配`——站点打得开、一写入就失败。这个故障 GET 探针看不出来，用下面这条判定（它打的是一个不存在的路径，不会写入任何数据；**必须带 `X-Work-Calendar: 1`**，否则拿到的是更前面那道门的另一个 403 `请求来源校验失败`）：

  ```bash
  curl -s -w ' %{http_code}\n' -X POST \
    -H 'X-Work-Calendar: 1' -H 'Origin: https://your-domain' \
    -H 'Content-Type: application/json' --data '{}' \
    https://your-domain/api/__origin_probe
  ```

  `401 请登录工作台` = 来源已放行（正常）；`403 请求来源不匹配` = 白名单还没配上。
- `WORK_CALENDAR_SECURE_COOKIE=1` 只在 HTTPS 访问时启用。
- 不要公开 `data/initial-accounts.txt` 或 SQLite 文件；建议将 `data/` 权限设为 `700`、数据库设为 `600`。
- 定期备份 `data/work-calendar.sqlite3`。API Key 保存在服务端数据库，不会返回给成员端。
- 可将 `backup.sh.example` 配置为每日 cron/systemd timer，使用 SQLite 在线备份并保留最近 14 天。
- Windows 上用 `backup-windows.example.py`（Python 3 已是运行依赖，无需额外安装）。它同样走 SQLite **在线备份 API**：WAL 模式下直接复制主文件会拿到撕裂快照、并静默丢掉还在 `-wal` 里的数据，而在线 API 无需停服即可取得一致性快照。备份后会重新打开产物校验 `integrity_check` 与逐表行数，保留最近 14 份，且**每条失败路径都会先删掉半成品**（否则按文件名判断的 `--skip-if-today` 会把坏文件当成「今天已备份」而静默停摆）。所有路径都是必填参数，文件本身不含任何机器专有信息。

  ```powershell
  python backup-windows.example.py --live <app.sqlite3> --dest-dir <备份目录> --keep 14
  python backup-windows.example.py ... --skip-if-today   # 开机补跑关机错过的那天
  ```

  两条 Windows 坑：登录触发器建计划任务需要提权，而无 BOM 的 `.ps1`/`.vbs` 会被按 ANSI 解析，包装脚本必须保持纯 ASCII。
