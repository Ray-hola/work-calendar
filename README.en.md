# Hola-Calendar

**A self-hosted task and project workbench for small teams.** One Python file and one SQLite database, no runtime dependencies, and your data stays on your own machine. The interface comes in 简体中文 and English; the product is called **Hola!** (Hola-Calendar) in English and **哗啦！** (哗啦待办) in Chinese.

[![Tests](https://github.com/Ray-hola/Hola-Calendar/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Ray-hola/Hola-Calendar/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](#requirements)
[![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](#requirements)

[Quick start](#quick-start) · [Docker](#docker) · [Features](#features) · [Where to change things](#where-to-change-things) · [中文](README.md)

![Week view: seven columns listing every member's tasks by day, with today highlighted](assets/readme/week.png)

## Why

Most collaboration tools want your tasks, daily notes and team data in someone else's cloud. Hola-Calendar keeps the whole loop (plan → do → finish → archive) and its rules in one auditable local service: `server.py` plus a SQLite file, reached on a local port and published through Cloudflare Tunnel or a reverse proxy when you need outside access.

## Features

- Interface language: each person picks 简体中文 or English in the avatar menu (or on the sign-in card). The choice is saved on the account and in the browser (`localStorage` key `hola-lang`); `?lang=en` shows one page in English without saving anything. Names people typed are never translated.

**Tasks**
- Three kinds: project tasks, one-off tasks (outside any project; members can create them for themselves or other members under their rule group, and the creator follows progress and reviews edit requests), and fixed tasks (daily, workdays, chosen weekdays, monthly or specific dates; can belong to a project; single days can be skipped).
- Finishing a task needs no approval. The assignee can correct the completion record, and the project Owner or an admin can send it back with a reason.
- Keyboard: press `?` for the shortcut list; `/` searches, `N` adds a task, and `T` / `W` / `P` / `I` open today, the week, the project space and the inbox, while `H` opens the usage guide. Shortcuts never fire while typing.
- Guided tour: offered on the first desktop visit per account and restartable from the guide. Open forms, unsaved edits, recording and an open assistant panel defer it until the current operation ends. Focus and shortcuts stay within the tour and focus returns on exit. Project rails support pointer and keyboard resizing above 760px; phones retain the stacked layout.
- Work left unfinished, fixed tasks included, carries to the next day automatically; the old day is hidden and leaves the counts. Manual deferral to a chosen date also works. The 已递延 (deferred) list and its count include only current deferred tasks that are still to do or in progress, once per task. Completed or skipped tasks leave the list, and reopened tasks return; deferral history stays in task details.
- Optional fixed-period stacking: superadmin can enable **Settings → 日程 (Schedule) → 固定任务递延合并** (off by default). Earlier deferred periods of the same rule, member and project collapse into one card marked "2 期" / "3 期" (two or three periods) after the next period reaches its start time, regardless of whether outstanding work is pending or in progress. Task promotion, hidden cards and period counts use the same instant and grouping in each snapshot. Future periods and unrelated work stay separate. One completion settles the whole group atomically, preserves every period/log and records actual time once; multiplicity counts periods, not days or work minutes. The group can also be deferred together. Task history groups individual events by original period and freezes the scope of grouped completion, deferral, reopen and correction events; actual time is shown once. Disabling restores separate pending periods; an already completed group remains one completion event. Daily/week views, details, statistics and AI queries share the grouping. SQL `tasks.stackCount` contains multiplicity (`coalesce(stackCount,1)` for ordinary work), with full records in `task_history`.
- When assigning, you see how many hours the person already has inside the task's own dates.

**Projects**
- Rule groups: under 系统设置 (system settings) in the sidebar, separate from the superadmin / admin / member roles, superadmin keeps rule groups for ordinary members. Existing groups are listed one per row; creating a group or opening one shows a card where one click sets whether a new project, a one-off task and a task inside a project one collaborates on is created directly, needs approval, or is not allowed, and whether the AI assistant is off, can answer and draft plans, or can act on the member's behalf; members are picked right on the card, all at once if needed. Members in no group follow the default rules: request projects, create one-off tasks directly, and use the assistant for questions and plans. A project task request goes to that project's Owner, a one-off task request to the admins. The top bar shows "+ New project / Request project" and "+ New task / Request task" to match. The diary automation settings live in 系统设置 too; account management only manages accounts.
- Project meetings: use Project files → New file → New meeting to save the schedule, participants, and agenda. Administrators manage the shared minutes prompt in System settings; existing meetings use the latest prompt when regenerated. The raw transcript can be pasted or entered with continuous browser speech recognition and is autosaved while recording. After the meeting, the configured AI model can produce minutes from the template; raw transcript and edited minutes remain separate for review. Model requests run outside the workspace lock, and stale results cannot overwrite changed source text or templates. Completed and archived projects retain read-only access through their file archive; overdue projects remain open for meeting and file management.
- Shared dictation: task/project descriptions, completion summaries, deferral notes, chat and other editable multiline inputs reuse the existing transcription service without opening the AI assistant first. The small microphone starts/stops dictation; text lands only in the chosen input and is never submitted automatically. A configured server service takes priority, with browser recognition as fallback; controls stay hidden without an available engine. Switching fields, rooms, pages or accounts, or closing a form cancels pending recording/transcription and ignores late results. Administrators retain connection configuration; regular accounts only receive availability, never connection details or keys. Form dictation works independently of AI assistant access.
- Settings are grouped into people & permissions, schedule, reports, meetings and the AI assistant. The category list follows the scroll, a search box filters the rows (`/` focuses it), switches and report schedules save on change while meeting prompts use an explicit Save button. Schedule writes are serialized, unsaved drafts survive refreshes and failures, and resetting restores the editor as well as the saved value. Save feedback appears in place, and one that differs from its default carries a bar and a reset link.
- Settings switches: repeat-period stacking and automatic project fallback reports save immediately when toggled. Turning project fallback reports off preserves the configured schedule and leaves personal diary rollups running.
- Project settings change the name, dates and collaborators; admins can also hand a project to a new Owner. Added collaborators join immediately with a notice, without accepting an invitation. Members can leave while keeping their tasks and records. New projects and assigned tasks carry fresh marks in the project space until opened.
- Open-ended project workload covers today minus 6 days through today plus 7 days; bounded projects use their own period. Tasks count when their dates overlap the window, with only the current deferral occurrence and no skipped tasks. Open, completed and duration figures in project staffing share that window.
- Project tasks sort by priority, start or end date, or a manual drag order. The timeline view draws every project on one date scale.
- Project spaces provide a folder → project → meetings/files directory, with one set of tabs for tasks, meetings, files, people and context. Long directory names wrap. Meeting refreshes keep the editor in place, and leaving asks before discarding unsaved changes. Admins manage the full directory; member state responses and navigation include only folders used by projects they can access. Edits made while a background save is pending remain unsaved until submitted, and failed saves can be retried.
- The project directory sits at the far left of the page. A folder lists all its projects, sortable by directory order, name, deadline, progress or creation time; clicking a project card or directory entry opens its space. Admins can drag every entry and Owners their own projects: a drop line toward the left lands beside a folder, toward the right inside it, and releasing over a folder files the project into it.
- Project titles are keyboard-focusable and open with Enter. Dropping outside the directory, Escape, window blur or pointer cancellation discards a drag. Further drags wait for the current save, and failed saves restore server state. Drag motion respects reduced-motion preferences.
- Project files support selection or drag-and-drop upload, up to 20MB each. Every file row exposes Open / Download / Delete; filenames and directory entries open the same file details (the editor for Markdown), with download as an explicit action. Uploaders, project Owners and admins retain their existing deletion rights, including in overdue projects. Attachments from completed or archived projects remain available through 归档文件 (archived files) in the project directory; admins can also enter from the achievements archive. Existing project viewers and admins retain read access; outsiders cannot read them, and archived files cannot be uploaded or deleted.
- Project Owners submit a closing report for admin approval; admins can also finish a project directly. A project can close early, with its unfinished tasks listed before confirmation and closed along with it. Closed projects move to the achievements archive.

**Collaboration and records**
- Per-recipient inbox: delete a notice from its card, or switch to 管理 to delete several or clear the read ones. A chat area with shared rooms and one room per project, with @mentions.
- Chat queries use a channel/time index and insertion order breaks timestamp ties, so clock rollback or backfilled history does not replace a newer channel preview. State refreshes retain every unread/actionable notification and the latest 200 other read notices; historical notices stay in the database.
- Archive room (the former diary and archive merged): one line-drawn archive box per month, with arrows to change month. Slide the pointer across the box, drag the date ruler below it or turn the wheel to pick a folder, and click to open it. Members see their own personal archive; admins see team briefs and can read member diaries. Project Owners do not receive diary text:
  - Members: one archive a day, pre-filled from that day's tasks (done / open and blocked / next) with the day's work log attached and a separate 随记 (personal notes) section excluded from team briefs. Open it and edit it in place, then save. 记录今天 opens today's. Days left unwritten are filled in from the tasks at 23:30.
  - Admins: one team brief a day (made the next morning: members' summaries, project progress, what needs attention), also editable in place; a diary filed later does not overwrite what was changed. Under the box are the picked day's work log, member load and project progress. 本周周报 opens the selected week's report (using the configured week start; Saturday to Friday by default) in place, covering both project and task outcomes: “What we did this week” retains completed project names, descriptions and closeout reports, and includes tasks actually completed that week with descriptions, completion notes and feedback. Tasks in unfinished projects, standalone tasks and recurring work all count; tasks belonging to a completed project appear under that project. “What remains” groups remaining tasks, reasons and scheduling under unfinished projects. Actual project and task completion dates determine the week; closeout requests awaiting approval are not completed outcomes. Deferred chains and merged periods are deduplicated; historical outcomes and backlog stop at the reporting cutoff, without taking later redo results or completion edits. Missing descriptions are reported honestly. Week navigation and filed daily briefs remain available.
- Desktop widget: an always-on-top picture-in-picture window with today's to-dos and a pomodoro timer (Chrome / Edge on desktop).
- AI assistant (optional): admins configure an OpenAI-compatible endpoint; the key stays on the server. Task and project creation, updates and deletion share one editable card workspace, from normal chat or 管理任务 / 项目 (manage tasks/projects). Creation cards support assignee/date/priority edits; update cards compare old and proposed values, submit only changed fields, and review project collaborator additions/removals in the same card. Deletion cards show impact, and deleting a project requires typing its complete name. Each card has independent Accept/Reject actions; native checkboxes support select-all or arbitrary multiselect, with Accept selected/Reject selected and an Accept all footer. Invalid, failed and untouched cards remain. Handled cards briefly pop upward and fade out; reduced motion skips this effect. Every card requires manual acceptance, even in automatic mode, and follows the submitting user's normal permissions and approval rules.
- AI connection: under 系统设置 → AI 接入与模型, add sources (OpenAI, Claude via an OpenAI-compatible gateway, Google Gemini, DeepSeek, Kimi, Qwen (DashScope), Zhipu GLM, SiliconFlow, OpenRouter, local Ollama or any OpenAI-compatible address, plus speech-to-text services); keys stay on the server. Saving a source tests it and fetches its model list, and a failure says why. Then pick a source and model for each job: the chat assistant, task planning, meeting minutes and speech-to-text; planning and minutes can follow the chat assistant. Installs that never open the page keep using their original model settings. The gear in the assistant panel opens this page, and the minutes prompt has a page of its own.
- On-demand tools: chat starts with identity, date, permissions and tool instructions, without a workbench snapshot. `workspace_schema`, `workspace_query` and `workspace_read` retrieve authorized tasks, projects, logs, reports and diaries; a disposable read-only SQL workspace performs joins and aggregates. Long records support continuation. `work_cards` drafts all task/project creates, updates and deletions; legacy `<action>` replies also become management cards. Other administrative actions continue through `business_action`.
- Update/deletion protection: cards bind to the reviewed record version. Changed targets or dependencies, including meeting transcripts/minutes and project-channel messages, reject stale submissions. Project deletion cards disclose meeting and message counts. 重新读取 (reread) retains the proposed patch for another review and resets deletion confirmation. Failed cards retain their error; retrying does not resubmit cards already completed. Rejection dismisses only the proposal and can be undone before a subsequent successful submission. Untouched fields, selections and handling decisions persist with the draft and recover after reload.
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
- Login hashes passwords outside the shared lock, then rechecks current credentials and account status under the lock before issuing a session. Password resets, disabling or replacing an account invalidate in-flight results. Failure records use a 15-minute window with global expiry cleanup, at most 4096 recently failed account/source pairs and eight records per pair. At capacity, the least recently failed pair is evicted; fixed-size digest keys bound memory for arbitrary input names.

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

Existing deployments need no data migration: `WORK_CALENDAR_*` environment variables, `data/work-calendar.sqlite3` and deployment service identifiers remain compatible.

Open `http://127.0.0.1:4173/`. The first start creates `data/work-calendar.sqlite3` and `data/initial-accounts.txt`; the latter holds random passwords for the seeded accounts `superadmin`, `test001` (project Owner) and `test002` / `test003` (collaborators). Change them after the first sign-in.

> The page has to be served by the local server; opening `index.html` directly cannot reach the API.

### Docker

```bash
docker compose -f deploy/docker-compose.example.yml up -d --build
```

The image holds only the runtime files (server, front end and dictionary), and data is mounted from the repository's `data/`. Public access, Tunnel and backups are covered in the [deployment guide](deploy/README.md#docker) (Chinese).

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
app.js               Front-end views and interaction; UI text is written in Chinese inside tr('…')
i18n.js              English UI dictionary (keyed by the Chinese source text)
index.html           Page skeleton; the ?v= values are the asset cache version
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

1. **Interface or interaction**: edit `app.js` / `styles.css` and bump the `?v=` version in `index.html`. Write new UI text as `tr('中文')` and add its English to `i18n.js`.
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

Issues and pull requests are welcome; read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. Hola-Calendar is released under the [MIT License](LICENSE).

Project spaces have Tasks, Meetings, Files, People and Context tabs. Expand a project in the sidebar to open meetings or download attachments. Meeting transcription uses the configured ASR service with complete audio clips approximately every four seconds; text is appended and saved while recording continues. Latency depends on the provider. Stop/navigation waits for the final clip. Failed clips can be retried on the same page; a three-clip backlog pauses recording. Unprocessed audio is in memory only and is lost on reload. Browser speech recognition remains the fallback when ASR is unconfigured. Transcript revision checks protect concurrent edits; archived meetings remain read-only. Refreshes carry summaries; opening a meeting fetches its authorized full record. Late responses cannot reopen an old meeting after switching meetings, pages or accounts.
Reasoning effort can be selected per chat, planning, or meeting-minutes scene in AI settings. Following the chat scene also inherits its effort. Default leaves the provider setting unchanged; explicit levels require a model/gateway supporting `reasoning_effort` and omit temperature for compatibility. Higher effort can increase latency and token usage. Speech transcription is unaffected.

Markdown rendering and editing are available for project context, meeting minutes and `.md` files. Manual minutes are saved when a meeting is first created. Online text-file saves use the same 20MB UTF-8 byte limit as uploads. Uploaders, project owners and administrators may edit; archived files stay read-only. Pending file reads are discarded after account/project navigation or closing the viewer.
Chat history can load earlier pages from the top. History and polling cursors include the full ordering key, so tied timestamps do not skip or repeat messages. Clicking an active quick filter clears it. Raster images, PDFs and UTF-8 text attachments support preview; other files download.

Content deletion is available in meeting rows/editors and file rows/Markdown viewers. Meeting creators, project owners and administrators may delete meetings they can still access; transcripts and minutes are removed together. Files retain uploader/owner/admin deletion rights. Actions require confirmation, archived content stays read-only, and cancellation or failure preserves the current content and draft.
