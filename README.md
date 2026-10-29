# Work Calendar

**战略小组台账**：自托管的团队任务与项目协作工作台。一个 Python 文件、一个 SQLite 数据库，零运行时依赖，数据只在你自己的机器上。

[![Tests](https://github.com/Ray-hola/work-calendar/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Ray-hola/work-calendar/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](#环境要求)
[![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](#环境要求)

[快速开始](#快速开始) · [Docker](#docker) · [功能](#功能) · [改代码去哪里](#改代码去哪里) · [English](README.en.md)

![周视图：一周七列，按天列出全部成员的任务，今天高亮](assets/readme/week.png)

## 为什么做这个项目

多数协作工具要求把任务、日报和成员数据放到第三方云上。Work Calendar 把完整的任务闭环（排期 → 执行 → 完成 → 归档）和协作规则放在一个可审计的本地服务里：`server.py` 加一个 SQLite 文件，页面通过本机端口访问，需要对外时用 Cloudflare Tunnel 或反向代理发布。

## 功能

**任务**
- 三种任务：项目任务、临时任务（不挂项目，成员可建给自己，管理员可指派他人）、固定安排（每天 / 工作日 / 每周几 / 每月 / 指定日期，可挂到项目，单日可挖空）。
- 完成即结束，不需要审批：执行人可以修改完成记录，项目 Owner 或管理员可以写明原因打回。
- 当日没做完的任务（包括固定安排）第二天自动递延，旧的那天隐藏且不计入统计；也可以手动递延到指定日期。
- 指派时按任务自己的起止时间显示对方已安排的工时。

**项目**
- 成员申请项目、管理员审批；项目设置可改名称、日期和协作者，管理员还可以更换 Owner。
- 项目内任务可按优先级、开始 / 结束时间排序或手动拖拽；项目时间轴按统一日期刻度展示。
- 结项需要提交报告并由 superadmin 审批，结项后进入成果库。

**协作与记录**
- 收件箱按收件人隔离；沟通区有公共频道和每个项目的频道，支持 @提及。
- 日记与统计：每天 23:30 汇总每个人的完成情况与投入负载。
- 桌面小组件：可置顶的画中画小窗，显示今日待办并带番茄钟（Chrome / Edge 桌面版）。
- AI 助手（可选）：管理员配置 OpenAI 兼容接口，Key 只保存在服务端。

**界面与权限**
- 桌面、平板、手机三档布局。
- superadmin、管理员、项目 Owner、协作者分级授权，越权操作由服务端拒绝；账户管理只对管理员可见，切换账户只列出在本浏览器登录过的账户。

<p align="center">
  <img src="assets/readme/projects.png" alt="项目空间：项目卡片列出任务、协作者和挂在项目下的固定任务" width="74%">
  <img src="assets/readme/mobile-today.png" alt="手机上的今日任务：日期页签、今日进度和按项目分组的任务" width="21%">
</p>

## 环境要求

- **Python 3.11+**，无第三方依赖（CI 在 3.11 和 3.12 上运行测试）。
- Windows 需要时区数据：`python -m pip install tzdata`。
- **Node.js 18+**：只有运行前端测试时需要（CI 使用 20）。
- 现代浏览器；桌面小组件需要 Chrome / Edge 116 以上。

## 快速开始

macOS / Linux：

```bash
./run.sh
```

Windows（PowerShell）：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run-windows.ps1          # 在当前目录前台运行
.\install-windows.ps1      # 或安装到 %LOCALAPPDATA%\WorkCalendar 并登录自启
```

打开 `http://127.0.0.1:4173/`。首次启动会创建 `data/work-calendar.sqlite3` 和 `data/initial-accounts.txt`，后者记录预置账户 `superadmin`、`test001`（项目 Owner）、`test002` / `test003`（协作者）的随机密码，首次登录后请修改。

> 页面必须通过本地服务访问，直接双击 `index.html` 连不上接口。

### Docker

```bash
docker compose -f deploy/docker-compose.example.yml up -d --build
```

镜像只包含四个运行文件，数据挂载在仓库的 `data/`。对外服务、Tunnel 和备份见 [部署指南](deploy/README.md#docker)。

## 配置

环境变量与命令行参数都可以，命令行参数优先。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WORK_CALENDAR_HOST` | `127.0.0.1` | 监听地址；用反向代理时保持本机回环 |
| `WORK_CALENDAR_PORT` | `4173` | 监听端口 |
| `WORK_CALENDAR_DB` | `data/work-calendar.sqlite3` | SQLite 数据库路径 |
| `WORK_CALENDAR_ORIGINS` | 空 | 允许的浏览器 Origin，逗号分隔；对外服务时必填 |
| `WORK_CALENDAR_SECURE_COOKIE` | `0` | 通过 HTTPS 访问时设为 `1`，给会话 Cookie 加 `Secure` |

## 部署

让服务只监听本机，再由 Cloudflare Tunnel 或 Caddy / Nginx 转发：

```bash
WORK_CALENDAR_ORIGINS=https://your-domain.example \
WORK_CALENDAR_SECURE_COOKIE=1 \
./run.sh --host 127.0.0.1 --port 4173
```

Docker Compose、Cloudflare Tunnel、Caddy、systemd、Windows 计划任务与备份模板都在 [`deploy/`](deploy/)。Cloudflare Pages 这类静态托管跑不了 Python + SQLite 后端。

## 改代码去哪里

```
server.py            HTTP 接口、权限、SQLite 存储、每日调度（递延、日记汇总）
app.js               前端视图与交互
index.html           页面骨架；两处 ?v= 是静态资源的缓存版本号
styles.css           样式（桌面 / 平板 / 手机三档）
tests/               后端 unittest 与前端 node:test 回归测试
deploy/              Docker Compose、Tunnel、Caddy、systemd、备份模板
Dockerfile           容器镜像
run.sh               macOS / Linux 启动
run-windows.ps1      Windows 前台启动
install-windows.ps1  Windows 安装并登录自启
workbench-start.*    Windows 一键启动服务与 Tunnel 并打开浏览器
assets/readme/       本页截图
data/                运行时数据（数据库、账户文件），不进版本库
```

一次常见改动的路径：

1. **改界面或交互**：改 `app.js` / `styles.css`，同时更新 `index.html` 里的 `?v=` 版本号。
2. **改规则或接口**：改 `server.py` 中对应的 `action` 分支，权限检查也在那里。
3. **补测试**：后端行为写进 `tests/test_*.py`，前端可见范围和日期边界写进 `tests/calendar.test.cjs`。
4. **本地验证**：

   ```bash
   python -m unittest discover -s tests -p "test_*.py"
   node --test tests/calendar.test.cjs
   ```

5. **提交**：开分支、发 Pull Request，CI 通过并经维护者批准后合入 `main`，规则见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。功能变化时同步更新本页和 [`README.en.md`](README.en.md)。

## 数据与安全

- `data/` 下的数据库、`initial-accounts.txt` 和 Tunnel 凭证只留在本机，`.gitignore` 与 `.dockerignore` 都已排除。
- 生产环境把 `data/` 权限设为 `700`、数据库与 WAL 文件设为 `600`，并定期备份。
- AI 助手的 API Key 只保存在服务端数据库，不会出现在审计记录或状态响应里。
- 发现安全问题请按 [`SECURITY.md`](SECURITY.md) 私下报告，不要直接开公开 Issue。

## 贡献与许可证

欢迎 Issue 和 Pull Request，先读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。本项目基于 [MIT License](LICENSE) 开源。
