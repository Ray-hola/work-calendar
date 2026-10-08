#!/usr/bin/env python3
"""Example: online SQLite backup for a WAL-mode app served from a Windows box.

Copy this next to your deployment and run it from Task Scheduler (or cron-equivalent).
Everything machine-specific is an argument, so this file stays safe to commit.

Why the online backup API and not a file copy:
  A WAL-mode database lives in three files (name, -wal, -shm). Copying the main file
  while the server is writing gives you a torn snapshot and silently omits whatever is
  still in the -wal (a 0.8 MB .sqlite3 with a 2.6 MB -wal means the copy misses most of
  the data). sqlite3's online backup API takes a consistent snapshot without stopping
  the server, and `pragma journal_mode=delete` turns the result into one self-contained
  file.

Verification is part of the backup, not a separate chore: the artifact is reopened,
`pragma integrity_check` must be ok, and per-table row counts must match the live
database. Every failure path deletes the artifact first, because a filename-based
`--skip-if-today` guard would otherwise treat a bad leftover as "already backed up"
and stop backing up silently.

Typical Task Scheduler entry (no admin rights needed for a DAILY task):
  schtasks /Create /F /TN "App DB Backup" /SC DAILY /ST 03:45 ^
    /TR "python.exe C:\\path\\to\\backup-windows.example.py --live C:\\path\\to\\app.sqlite3 --dest-dir C:\\path\\to\\backups"
Catch up after a missed run (machine was off): a hidden .vbs in the Startup folder
running the same command with --skip-if-today. Two Windows gotchas worth knowing:
a logon-triggered scheduled task needs elevation (access denied), and a BOM-less .ps1/.vbs
is decoded as ANSI, so keep those wrappers pure ASCII.

Usage:
  python backup-windows.example.py --live <app.sqlite3> --dest-dir <backup dir>
  python backup-windows.example.py ... --skip-if-today --keep 14
Exit code 0 = a verified backup for today exists, 1 = failure (logged next to the backups).
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sqlite3
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True, help="path to the live SQLite database")
    ap.add_argument("--dest-dir", required=True, help="directory for backup artifacts + log")
    ap.add_argument("--prefix", default="backup", help="artifact filename prefix")
    ap.add_argument("--keep", type=int, default=14, help="how many artifacts to keep")
    ap.add_argument("--skip-if-today", action="store_true", help="no-op if a backup exists today")
    args = ap.parse_args()

    dest_dir = args.dest_dir
    log_path = os.path.join(dest_dir, args.prefix + ".log")
    os.makedirs(dest_dir, exist_ok=True)   # listdir below must not run before this exists

    def log(msg: str) -> None:
        line = f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
        os.makedirs(dest_dir, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        print(line)

    def fail(msg: str) -> "None":
        log("FAILED: " + msg)
        sys.exit(1)

    def table_counts(conn: sqlite3.Connection) -> dict:
        names = [r[0] for r in conn.execute(
            "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
        return {n: conn.execute(f'select count(*) from "{n}"').fetchone()[0] for n in names}

    if not os.path.exists(args.live):
        fail(f"live database not found: {args.live}")

    existing = sorted(f for f in os.listdir(dest_dir)
                      if f.startswith(args.prefix + "-") and f.endswith(".sqlite3"))
    if args.skip_if_today:
        for f in existing:
            stamp = f[len(args.prefix) + 1:-len(".sqlite3")]
            try:
                if dt.datetime.strptime(stamp, "%Y%m%d-%H%M%S").date() == dt.date.today():
                    log(f"skip: a backup from today already exists ({f})")
                    return
            except ValueError:
                continue

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(dest_dir, f"{args.prefix}-{stamp}.sqlite3")

    src = sqlite3.connect(f"file:{args.live}?mode=ro", uri=True)   # never mutate the source
    try:
        live_counts = table_counts(src)
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)                        # online backup API: WAL-safe
            dst.execute("pragma journal_mode=delete")
            dst.commit()
        finally:
            dst.close()
    except sqlite3.Error as exc:
        src.close()
        if os.path.exists(dest):
            os.remove(dest)
        fail(f"sqlite backup error: {exc}")
    src.close()
    log(f"live counts ({len(live_counts)} tables, {sum(live_counts.values())} rows)")

    def discard() -> None:
        try:
            os.remove(dest)
        except OSError:
            pass

    try:
        chk = sqlite3.connect(f"file:{dest}?mode=ro", uri=True)
        integrity = chk.execute("pragma integrity_check").fetchone()[0]
        copied = table_counts(chk)
        chk.close()
    except sqlite3.Error as exc:
        discard()
        fail(f"a backup that cannot be reopened is not a backup: {exc}")

    if integrity != "ok":
        discard()
        fail(f"integrity_check on the copy returned: {integrity}")
    missing = sorted(set(live_counts) - set(copied))
    diff = {k: (live_counts[k], copied[k]) for k in live_counts if k in copied and copied[k] != live_counts[k]}
    if missing or diff:
        discard()
        fail(f"copy does not match source (missing={missing} mismatched={diff})")

    log(f"backup OK: {dest} bytes={os.path.getsize(dest)} tables={len(copied)} rows={sum(copied.values())} integrity=ok")

    for old in sorted(existing + [os.path.basename(dest)])[:-args.keep]:
        p = os.path.join(dest_dir, old)
        if os.path.exists(p):
            os.remove(p)
            log(f"retention: removed {old}")


if __name__ == "__main__":
    main()
