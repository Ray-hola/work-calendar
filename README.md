# Work Calendar

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](#环境要求)

一个自托管的团队任务与项目协作工作台：单人即可部署，无需外部数据库或前端构建链，所有数据保存在本机 SQLite。

> A self-hosted task and project collaboration workbench. Single-process Python server, zero runtime dependencies, SQLite storage — designed for small teams that want to own their data.

## 为什么做这个项目

多数团队协作工具要求把任务、日报和成员数据放到第三方云上。Work Calendar 把完整的任务闭环（排期 → 执行 → 审批 → 归档）和协作规则放在一个可审计的本地服务里：一个 `server.py`、一个 SQLite 文件，页面通过本机端口访问，可用 Cloudflare Tunnel 或反向代理对外发布。

## 功能特性

- **日程与任务闭环**：周视图滚动浏览、跨日自动递延、进行中状态流转，支持完成 / 递延 / 跳过并记录实际耗时与原因。
- **项目协作**：项目创建与审批、Owner 邀请成员、按「项目 → 任务」展示的子任务树、完成审批与结项报告。
- **固定安排**：支持每天、工作日、每周指定星期或指定日期，并可对单次日期临时挖空。
- **通知与收件箱**：按收件人隔离，未读红点，单条或全部已读。
- **日记与统计**：成员周视图日记，每日 23:30 自动统计完成情况与投入负载并汇总给管理员。
- **项目时间轴**：统一日期刻度、每项目一行色块，横向滚动同步。
- **权限边界**：`superadmin`、项目 Owner、协作者三级角色；服务端对越权操作一律拒绝。
- **嵌入式 AI 助手**（可选）：管理员统一配置 OpenAI 兼容 API Key，普通成员只能使用只读查询策略；Key 保存在服务端，不返回给成员。

## 环境要求

- **Python 3.11+**（开发在 3.12 上验证）
- 无第三方 Python 依赖，仅使用标准库
- Windows 上需要标准库时区数据：`python -m pip install tzdata`
- **Node.js 18+**：仅运行前端回归测试时可选

## 快速开始

macOS / Linux：

```bash
./run.sh
```

Windows（PowerShell）：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1   # 安装到 %LOCALAPPDATA%\WorkCalendar 并注册登录自启
# 或仅在本目录前台运行：
.\run-windows.ps1
```

打开 `http://127.0.0.1:4173/`。首次启动会创建 `data/work-calendar.sqlite3` 和 `data/initial-accounts.txt`，账户文件权限为 600。

预置账户：`superadmin`（管理员）、`test001`（项目 Owner）、`test002` / `test003`（协作者）。密码随机生成并写入 `data/initial-accounts.txt`，首次登录后请立即修改。

> 页面必须通过本地服务访问，直接双击 `index.html` 不会连接到 API。

## 配置

通过环境变量或命令行参数配置，命令行参数优先。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WORK_CALENDAR_HOST` | `127.0.0.1` | 监听地址；使用反向代理时保持本机回环 |
| `WORK_CALENDAR_PORT` | `4173` | 监听端口 |
| `WORK_CALENDAR_DB` | `data/work-calendar.sqlite3` | SQLite 数据库路径 |
| `WORK_CALENDAR_ORIGINS` | 空 | 允许的浏览器 Origin，多个用逗号分隔（生产环境必填） |
| `WORK_CALENDAR_SECURE_COOKIE` | `0` | HTTPS 访问时设为 `1`，为会话 Cookie 加 `Secure` |

## 测试

```bash
python -m unittest discover -s tests -p "test_*.py"
node --test tests/calendar.test.cjs
```

权限测试使用临时数据库，不会改动现有数据；前端测试覆盖成员可见范围、刷新状态、跨月/跨年与闰日、开放周期和无效日期。

## 部署

推荐让服务只监听 `127.0.0.1:4173`，再由 Cloudflare Tunnel 或 Caddy/Nginx 反向代理转发，不直接暴露应用端口：

```bash
WORK_CALENDAR_ORIGINS=https://your-domain.example \
WORK_CALENDAR_SECURE_COOKIE=1 \
./run.sh --host 127.0.0.1 --port 4173
```

Cloudflare Tunnel、Caddy、systemd 与备份模板见 [`deploy/`](deploy/)。注意：Cloudflare Pages 静态托管无法运行当前 Python + SQLite 后端。

## 项目结构

```
server.py            单文件服务：HTTP API + SQLite + 调度器
app.js               前端交互与视图
index.html           页面骨架
styles.css           样式
run.sh               macOS / Linux 启动脚本
run-windows.ps1      Windows 前台启动脚本
install-windows.ps1  Windows 安装脚本（复制到用户目录并注册登录自启）
deploy/              Cloudflare Tunnel、Caddy、systemd、备份模板
tests/               后端与前端回归测试
data/                运行时生成（数据库与账户文件，不进入版本库）
```

## 数据与安全

- 不要在版本库中提交 `data/` 下的任何内容；`initial-accounts.txt`、SQLite 和 Tunnel 凭证只应留在本机。
- 生产环境将 `data/` 权限设为 `700`、数据库与 WAL 文件设为 `600`，并定期备份。
- API Key 仅保存在服务端数据库，不会出现在审计记录或状态响应中。
- 发现安全问题请按 [`SECURITY.md`](SECURITY.md) 的方式私下报告，不要直接开公开 Issue。

## 贡献

欢迎提交 Issue 和 Pull Request，请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
