# Work Calendar

**A self-hosted task and project workbench for small teams.** One Python file and one SQLite database, no runtime dependencies, and your data stays on your own machine. The interface is in Chinese; its built-in name is 战略小组台账.

[![Tests](https://github.com/Ray-hola/work-calendar/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Ray-hola/work-calendar/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](#requirements)
[![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](#requirements)

[Quick start](#quick-start) · [Docker](#docker) · [Features](#features) · [Where to change things](#where-to-change-things) · [中文](README.md)

![Week view: seven columns listing every member's tasks by day, with today highlighted](assets/readme/week.png)

## Why

Most collaboration tools want your tasks, daily notes and team data in someone else's cloud. Work Calendar keeps the whole loop (plan → do → finish → archive) and its rules in one auditable local service: `server.py` plus a SQLite file, reached on a local port and published through Cloudflare Tunnel or a reverse proxy when you need outside access.

## Features

**Tasks**
- Three kinds: project tasks, one-off tasks (outside any project; members can create them for themselves or other members under their rule group, and the creator follows progress and reviews edit requests), and fixed tasks (daily, workdays, chosen weekdays, monthly or specific dates; can belong to a project; single days can be skipped).
- Finishing a task needs no approval. The assignee can correct the completion record, and the project Owner or an admin can send it back with a reason.
- Keyboard: press `?` for the shortcut list; `/` searches, `N` adds a task, and `T` / `W` / `P` / `I` open today, the week, the project space and the inbox. Shortcuts never fire while typing.
- Work left unfinished, fixed tasks included, carries to the next day automatically; the old day is hidden and leaves the counts. Manual deferral to a chosen date also works. The 已递延 (deferred) list and its count include only current deferred tasks that are still to do or in progress, once per task. Completed or skipped tasks leave the list, and reopened tasks return; deferral history stays in task details.
- Optional fixed-period stacking: superadmin can enable **Settings → Fixed tasks → Deferral grouping → Group unfinished periods** (off by default). Earlier deferred periods of the same rule, member and project collapse into one card marked "2 期" / "3 期" (two or three periods) after the next period reaches its start time, regardless of whether outstanding work is pending or in progress. Task promotion, hidden cards and period counts use the same instant and grouping in each snapshot. Future periods and unrelated work stay separate. One completion settles the whole group atomically, preserves every period/log and records actual time once; multiplicity counts periods, not days or work minutes. The group can also be deferred together. Task history groups individual events by original period and freezes the scope of grouped completion, deferral, reopen and correction events; actual time is shown once. Disabling restores separate pending periods; an already completed group remains one completion event. Daily/week views, details, statistics and AI queries share the grouping. SQL `tasks.stackCount` contains multiplicity (`coalesce(stackCount,1)` for ordinary work), with full records in `task_history`.
- When assigning, you see how many hours the person already has inside the task's own dates.

**Projects**
- Rule groups: under 系统设置 (system settings) in the sidebar, separate from the superadmin / admin / member roles, superadmin keeps rule groups for ordinary members. Existing groups are listed one per row; creating a group or opening one shows a card where one click sets whether a new project, a one-off task and a task inside a project one collaborates on is created directly, needs approval, or is not allowed, and whether the AI assistant is off, can answer and draft plans, or can act on the member's behalf; members are picked right on the card, all at once if needed. Members in no group follow the default rules: request projects, create one-off tasks directly, and use the assistant for questions and plans. A project task request goes to that project's Owner, a one-off task request to the admins. The top bar shows "+ New project / Request project" and "+ New task / Request task" to match. The diary automation settings live in 系统设置 too; account management only manages accounts.
- Project meetings: each project space can create meetings with schedule, participants, agenda, and a prompt template. The raw transcript can be pasted or entered with continuous browser speech recognition and is autosaved while recording. After the meeting, the configured AI model can produce minutes from the template; raw transcript and edited minutes remain separate for review.
- Shared dictation: task/project descriptions, completion summaries, deferral notes, chat and other editable multiline inputs reuse the existing transcription service without opening the AI assistant first. The small microphone starts/stops dictation; text lands only in the chosen input and is never submitted automatically. A configured server service takes priority, with browser recognition as fallback; controls stay hidden without an available engine. Switching fields, rooms, pages or accounts, or closing a form cancels pending recording/transcription and ignores late results. Administrators retain connection configuration; regular accounts only receive availability, never connection details or keys. Form dictation works independently of AI assistant access.
- Settings switches: repeat-period stacking and automatic project fallback reports save immediately when toggled. Turning project fallback reports off preserves the configured schedule and leaves personal diary rollups running.
- Project settings change the name, dates and collaborators; admins can also hand a project to a new Owner. Added collaborators join immediately with a notice, without accepting an invitation. Members can leave while keeping their tasks and records. New projects and assigned tasks carry fresh marks in the project space until opened.
- Open-ended project workload covers today minus 6 days through today plus 7 days; bounded projects use their own period. Tasks count when their dates overlap the window, with only the current deferral occurrence and no skipped tasks. Open, completed and duration figures in project staffing share that window.
- Project tasks sort by priority, start or end date, or a manual drag order. The timeline view draws every project on one date scale.
- Project spaces provide a folder → project directory, background notes, member responsibilities and attachments. Admins manage the full directory; member state responses and navigation include only folders used by projects they can access. Edits made while a background save is pending remain unsaved until submitted, and failed saves can be retried.
- The project directory sits at the far left of the page. A folder lists all its projects, sortable by directory order, name, deadline, progress or creation time; clicking a project card or directory entry opens its space. Admins can drag every entry and Owners their own projects: a drop line toward the left lands beside a folder, toward the right inside it, and releasing over a folder files the project into it.
- Project titles are keyboard-focusable and open with Enter. Dropping outside the directory, Escape, window blur or pointer cancellation discards a drag. Further drags wait for the current save, and failed saves restore server state. Drag motion respects reduced-motion preferences.
- Project files support selection or drag-and-drop upload, download and permission-checked deletion, up to 20MB each. Attachments from completed, archived or expired projects remain available through 归档文件 (archived files) in the project directory; admins can also enter from the achievements archive. Existing project viewers and admins retain read access; outsiders cannot read them, and archived files cannot be uploaded or deleted.
- Project Owners submit a closing report for admin approval; admins can also finish a project directly. A project can close early, with its unfinished tasks listed before confirmation and closed along with it. Closed projects move to the achievements archive.

**Collaboration and records**
- Per-recipient inbox: delete a notice from its card, or switch to 管理 to delete several or clear the read ones. A chat area with shared rooms and one room per project, with @mentions.
- Archive room (the former diary and archive merged): one line-drawn archive box per month, with arrows to change month. Slide the pointer across the box, drag the date ruler below it or turn the wheel to pick a folder, and click to open it. Members see their own personal archive; admins see team briefs and can read member diaries. Project Owners do not receive diary text:
  - Members: one archive a day, pre-filled from that day's tasks (done / open and blocked / next) with the day's work log attached and a separate 随记 (personal notes) section excluded from team briefs. Open it and edit it in place, then save. 记录今天 opens today's. Days left unwritten are filled in from the tasks at 23:30.
  - Admins: one team brief a day (made the next morning: members' summaries, project progress, what needs attention), also editable in place; a diary filed later does not overwrite what was changed. Under the box are the picked day's work log, member load and project progress. 本周周报 opens the selected week's report (using the configured week start; Saturday to Friday by default) in place, showing totals, daily completions, member load and project progress. Arrows switch weeks; clicking a filed day opens its brief.
- Desktop widget: an always-on-top picture-in-picture window with today's to-dos and a pomodoro timer (Chrome / Edge on desktop).
- AI assistant (optional): admins configure an OpenAI-compatible endpoint; the key stays on the server. Task and project creation, updates and deletion share one editable card workspace, from normal chat or 管理任务 / 项目 (manage tasks/projects). Creation cards support assignee/date/priority edits; update cards compare old and proposed values, submit only changed fields, and review project collaborator additions/removals in the same card. Deletion cards show impact, and deleting a project requires typing its complete name. Each card has independent Accept/Reject actions; native checkboxes support select-all or arbitrary multiselect, with Accept selected/Reject selected and an Accept all footer. Invalid, failed and untouched cards remain. Handled cards briefly pop upward and fade out; reduced motion skips this effect. Every card requires manual acceptance, even in automatic mode, and follows the submitting user's normal permissions and approval rules.
- AI connection: presets for OpenAI, Claude via an OpenAI-compatible gateway, Google Gemini, DeepSeek, Kimi, Qwen (DashScope), Zhipu GLM, SiliconFlow, OpenRouter and local Ollama, or any OpenAI-compatible address. 测试连接 (test connection) discovers models, then requires an actual text response from the selected model; an empty selection tries a discovered chat model. OpenAI reasoning models use compatible generation parameters. A preset catalogue alone never establishes success. Changing the provider, address, key or model, or closing configuration, invalidates pending tests. Testing does not save configuration; after saving, admins can switch models from the header chip, with keyboard support.
- On-demand tools: chat starts with identity, date, permissions and tool instructions, without a workbench snapshot. `workspace_schema`, `workspace_query` and `workspace_read` retrieve authorized tasks, projects, logs, reports and diaries; a disposable read-only SQL workspace performs joins and aggregates. Long records support continuation. `work_cards` drafts all task/project creates, updates and deletions; legacy `<action>` replies also become management cards. Other administrative actions continue through `business_action`.
- Update/deletion protection: cards bind to the reviewed record version. Changed targets or dependencies reject stale submissions. 重新读取 (reread) retains the proposed patch for another review and resets deletion confirmation. Failed cards retain their error; retrying does not resubmit cards already completed. Rejection dismisses only the proposal and can be undone before a subsequent successful submission. Untouched fields, selections and handling decisions persist with the draft and recover after reload.
- Context budget: the entire serialized input, including instructions, tools, history and results, is capped at 16k, 32k or 64k characters (32k by default). Older history and tool exchanges are removed together while preserving the current question. Each turn allows up to eight tool calls, with query output and compute limits; oversized requests ask for a narrower scope. Legacy settings map to the new tiers. Replies show a compact retrieval count without exposing SQL in the chat.
- AI collaboration: editable plan cards open to the left of the conversation, with a stacked layout on phones. Missing names and unresolved assignees remain blank and are marked red; confirmation waits until required fields are complete. Incomplete replies or connection failures preserve the original request for retry; a failed edit/delete request never becomes a create card. Use ↑ to recall the last input, copy messages, edit and resend, rewind the current conversation, or undo and copy draft changes. Pause / resume retains progress; stop keeps drafts and receipts, lets an already-sent operation finish, then prevents further steps. Rewinding a conversation does not undo created data.
- Conversation history opens in the assistant’s left sidebar with create, switch, rename and delete actions; empty conversations persist too. Assistant text buttons share a 32px height with equal-width paired actions. Copy, edit/resend and rewind use 12px icons below the bubble, revealed on desktop hover or keyboard focus and kept visible on touch devices. The UI retains essential labels, status, errors and deletion impact. Card edits, selection and accepted/rejected states persist on the server and recover after reload, with account-scoped local recovery for unsynced edits; unsent input stays with its conversation in the current page; admin review of another account is read-only and cannot execute drafts. Sending waits for history to load, and stale responses cannot overwrite a newer selection.
- Assistant recovery: stable card IDs and durable execution receipts make retries safe after a lost response. Concurrent draft edits require reload on a version conflict. Edit/resend and rewind persist the active conversation branch while retaining business receipts; late replies cannot revive deleted conversations. Legacy drafts without outcome metadata explicitly copy into a new draft.
- Assistant feedback: narrow panels switch between cards and chat, with visible replies/errors. Batch actions display their scope and count. Long runs retain the original user goal, and a successful write remains successful if later view verification fails. Connection probes run outside the workspace lock.
- Credentials: new API roots never inherit old keys; explicit no-key and server-key removal controls are available. Account creation collects an initial password separately in the confirmation card, never in model proposals or retained audit/action records. A one-time migration redacts legacy structured credentials without changing project/task data or password hashes.
- Personal signature: one line written in your profile, shown under the avatar in the sidebar, the account menu and the account list.

**Layout and access**
- Desktop, tablet and phone layouts. Admins choose the team week start in system settings; calendar weeks, archive ranges and weekly briefs follow it.
- Resize the AI assistant from its transparent left edge (width), top edge (height), or top-left corner (both), with no visible grip. Plain chat, history, planning and combined layouts remember their own sizes. Viewport clamps preserve desired sizes. Double-click an edge to reset; Esc cancels a drag. Focus an edge for arrow-key adjustments, Shift for larger steps, Home for defaults and End for the maximum.
- Scrollbars stay hidden throughout the app while wheel, touch and keyboard scrolling remain available. Drag the right edge of the main navigation, project directory or chat channel rail to resize it, or use its arrow to collapse / expand. The narrowest desktop state keeps icons and full-name tooltips; overflowing labels fade at the end. Desktop width ranges are 72–360, 56–340 and 64–320 px respectively, with smaller effective maximums when content space is limited. Widths and previous expanded sizes are saved in the current browser and restored on reload.
- Focus a divider to use Left / Right (Shift for larger steps), Home / End for the limits, or Enter to collapse / expand; double-click to reset its width. Esc cancels a drag. Phones retain the horizontal main navigation. The project directory on tablets and phones, and the phone channel list, collapse / expand without squeezing the content. Motion respects the system's reduced-motion preference.
- Identity is one of three roles: superadmin, admin or member. Being a project's Owner or a collaborator only decides what one can do inside that project. The server refuses anything beyond these rights. Account management is visible to admins only: superadmin drags accounts to reorder them or move them to another role, or presses 管理 (manage) on a role to tick several accounts and disable / enable, delete, reset the password to 123456 or set the Chinese name. Account switching in the avatar menu lists only accounts that signed in on that browser.

<p align="center">
  <img src="assets/readme/projects.png" alt="Projects: each card lists its tasks, collaborators and the fixed tasks attached to it" width="74%">
  <img src="assets/readme/mobile-today.png" alt="Today on a phone: the date tab, today's progress and tasks grouped by project" width="21%">
</p>

## Requirements

- **Python 3.11+**, standard library only (CI runs the tests on 3.11 and 3.12).
- On Windows, time-zone data: `python -m pip install tzdata`.
- **Node.js 18+**, only for the front-end tests (CI uses 20).
- A current browser; the desktop widget needs Chrome / Edge 116 or later.

## Quick start

macOS / Linux:

```bash
./run.sh
```

Windows (PowerShell):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run-windows.ps1          # run in the foreground from this folder
.\install-windows.ps1      # or install to %LOCALAPPDATA%\WorkCalendar and start at sign-in
```

Open `http://127.0.0.1:4173/`. The first start creates `data/work-calendar.sqlite3` and `data/initial-accounts.txt`; the latter holds random passwords for the seeded accounts `superadmin`, `test001` (project Owner) and `test002` / `test003` (collaborators). Change them after the first sign-in.

> The page has to be served by the local server; opening `index.html` directly cannot reach the API.

### Docker

```bash
docker compose -f deploy/docker-compose.example.yml up -d --build
```

The image holds only the four runtime files, and data is mounted from the repository's `data/`. Public access, Tunnel and backups are covered in the [deployment guide](deploy/README.md#docker) (Chinese).

## Configuration

Use environment variables or command-line flags; flags win.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORK_CALENDAR_HOST` | `127.0.0.1` | Listen address; keep it on loopback behind a reverse proxy |
| `WORK_CALENDAR_PORT` | `4173` | Listen port |
| `WORK_CALENDAR_DB` | `data/work-calendar.sqlite3` | SQLite database path |
| `WORK_CALENDAR_ORIGINS` | empty | Allowed browser origins, comma-separated; required for public access |
| `WORK_CALENDAR_SECURE_COOKIE` | `0` | Set to `1` when served over HTTPS so the session cookie is `Secure` |

## Deployment

Keep the service on loopback and put Cloudflare Tunnel or Caddy / Nginx in front of it:

```bash
WORK_CALENDAR_ORIGINS=https://your-domain.example \
WORK_CALENDAR_SECURE_COOKIE=1 \
./run.sh --host 127.0.0.1 --port 4173
```

Templates for Docker Compose, Cloudflare Tunnel, Caddy, systemd, Windows scheduled tasks and backups are in [`deploy/`](deploy/). Static hosts such as Cloudflare Pages cannot run the Python + SQLite back end.

## Where to change things

```
server.py            HTTP API, permissions, SQLite storage, scheduler and agent loop
agent_workspace.py   Isolated read-only SQL workspace, tool schemas and record reads
assistant_privacy.py  Connection-bound keys and assistant record redaction
app.js               Front-end views and interaction
index.html           Page skeleton; the two ?v= values are the asset cache version
styles.css           Styles (desktop / tablet / phone)
tests/               Back-end unittest and front-end node:test suites
deploy/              Docker Compose, Tunnel, Caddy, systemd, backup templates
Dockerfile           Container image
run.sh               Start on macOS / Linux
run-windows.ps1      Start on Windows in the foreground
install-windows.ps1  Install on Windows and start at sign-in
workbench-start.*    Windows: start the service and Tunnel, open the browser
assets/readme/       Screenshots on this page
data/                Runtime data (database, account file), never committed
```

A typical change:

1. **Interface or interaction**: edit `app.js` / `styles.css` and bump the `?v=` version in `index.html`.
2. **Rules or API**: edit the matching `action` branch in `server.py`; its permission checks live there too.
3. **Tests**: back-end behaviour goes in `tests/test_*.py`, front-end visibility and date edge cases in `tests/calendar.test.cjs`.
4. **Check locally**:

   ```bash
   TZ=Asia/Shanghai python -m unittest discover -s tests -p "test_*.py"
   TZ=Asia/Shanghai node --test tests/calendar.test.cjs
   ```

5. **Submit**: branch, open a pull request, and it merges into `main` once CI passes and the maintainer approves; see [`CONTRIBUTING.md`](CONTRIBUTING.md) (Chinese). Update this page and [`README.md`](README.md) when features change.

## Data and security

- The database, `initial-accounts.txt` and Tunnel credentials under `data/` stay on your machine; `.gitignore` and `.dockerignore` both exclude them.
- In production, set `data/` to `700` and the database and WAL files to `600`, and back them up regularly.
- The AI assistant's API key is stored only in the server database and never appears in audit records or state responses.
- Report security problems privately as described in [`SECURITY.md`](SECURITY.md) (Chinese), not in a public issue.

## Contributing and license

Issues and pull requests are welcome; read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. Work Calendar is released under the [MIT License](LICENSE).
