"""SQLite store for trends, ideas, posts and metrics."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY, brand_id TEXT, source TEXT, title TEXT, url TEXT,
  traffic TEXT, fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brand_id, source, title)
);
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY, brand_id TEXT, title TEXT, hook TEXT, format TEXT,
  topic TEXT, score REAL, rationale TEXT, status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, idea_id INTEGER, brand_id TEXT, page_id TEXT,
  is_main INTEGER, platform TEXT, scheduled_at TEXT, payload TEXT,
  status TEXT DEFAULT 'draft', external_id TEXT, media_id TEXT,
  hook_type TEXT, format TEXT, topic TEXT
);
CREATE TABLE IF NOT EXISTS metrics (
  post_id INTEGER, collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  views INTEGER, reach INTEGER, likes INTEGER, comments INTEGER,
  saves INTEGER, shares INTEGER, raw TEXT
);
"""


class Store:
    def __init__(self, path: str | Path = "data/engine.db"):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        cur = self.db.execute(sql, params)
        self.db.commit()
        return cur

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self.db.execute(sql, params).fetchall()

    def add_post(self, **kw) -> int:
        kw["payload"] = json.dumps(kw.get("payload", {}), ensure_ascii=False)
        cols = ",".join(kw)
        qs = ",".join("?" * len(kw))
        return self.execute(f"INSERT INTO posts ({cols}) VALUES ({qs})", tuple(kw.values())).lastrowid
