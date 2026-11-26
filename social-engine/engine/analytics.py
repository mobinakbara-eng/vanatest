"""Collect post metrics (Instagram Graph API) and turn them into a strategy summary for the idea generator."""
from __future__ import annotations

import json
import os
from collections import defaultdict

import requests

from .store import Store

GRAPH = "https://graph.facebook.com/v23.0"
IG_METRICS = "views,reach,likes,comments,saved,shares"


def collect_instagram(store: Store) -> int:
    token = os.environ.get("IG_ACCESS_TOKEN")
    if not token:
        print("[analytics] IG_ACCESS_TOKEN not set; skipping Instagram")
        return 0
    n = 0
    for p in store.query("SELECT id, media_id FROM posts WHERE platform='instagram' AND media_id IS NOT NULL"):
        r = requests.get(f"{GRAPH}/{p['media_id']}/insights",
                         params={"metric": IG_METRICS, "access_token": token}, timeout=20)
        if r.status_code != 200:
            print(f"[analytics] {p['media_id']}: {r.status_code} {r.text[:200]}")
            continue
        vals = {m["name"]: m["values"][0]["value"] for m in r.json().get("data", [])}
        store.execute(
            "INSERT INTO metrics (post_id, views, reach, likes, comments, saves, shares, raw) VALUES (?,?,?,?,?,?,?,?)",
            (p["id"], vals.get("views"), vals.get("reach"), vals.get("likes"), vals.get("comments"),
             vals.get("saved"), vals.get("shares"), json.dumps(vals)),
        )
        n += 1
    return n


def import_csv(store: Store, path: str) -> int:
    """For TikTok (or anything without API access): CSV with post_id,views,likes,comments,saves,shares."""
    import csv
    n = 0
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            store.execute(
                "INSERT INTO metrics (post_id, views, likes, comments, saves, shares) VALUES (?,?,?,?,?,?)",
                tuple(int(row.get(k) or 0) if k != "post_id" else row[k]
                      for k in ("post_id", "views", "likes", "comments", "saves", "shares")),
            )
            n += 1
    return n


def _score(m) -> float:
    views = m["views"] or 0
    if views == 0:
        return 0.0
    # weighted engagement per view: shares and saves are the strongest distribution signals
    return ((m["likes"] or 0) + 2 * (m["comments"] or 0) + 3 * (m["saves"] or 0) + 4 * (m["shares"] or 0)) / views


def summary(store: Store, brand_id: str) -> dict:
    rows = store.query("""
        SELECT p.*, m.views, m.likes, m.comments, m.saves, m.shares
        FROM posts p JOIN metrics m ON m.post_id = p.id
        WHERE p.brand_id = ? AND m.collected_at = (SELECT MAX(collected_at) FROM metrics WHERE post_id = p.id)
    """, (brand_id,))
    groups: dict[str, dict[str, list]] = {k: defaultdict(list) for k in ("hook_type", "format", "topic", "hour", "page_id")}
    for r in rows:
        hour = (r["scheduled_at"] or "T00")[11:13]
        for key, val in (("hook_type", r["hook_type"]), ("format", r["format"]), ("topic", r["topic"]),
                         ("hour", hour), ("page_id", r["page_id"])):
            groups[key][val].append((r["views"] or 0, _score(r)))
    out = {}
    for key, g in groups.items():
        out[key] = sorted(
            ({"value": v, "posts": len(x), "avg_views": sum(a for a, _ in x) / len(x),
              "avg_engagement": round(sum(b for _, b in x) / len(x), 4)} for v, x in g.items()),
            key=lambda d: d["avg_views"], reverse=True,
        )
    out["posts_measured"] = len(rows)
    return out


def summary_text(s: dict) -> str:
    if not s.get("posts_measured"):
        return ""
    lines = [f"Measured posts: {s['posts_measured']}"]
    for key in ("hook_type", "format", "topic", "hour", "page_id"):
        top = ", ".join(f"{d['value']} ({d['avg_views']:.0f} views, eng {d['avg_engagement']})" for d in s[key][:4])
        lines.append(f"Best {key}: {top}")
    return "\n".join(lines)


def best_hour(s: dict) -> int | None:
    hours = [d for d in s.get("hour", []) if d["posts"] >= 3]
    return int(hours[0]["value"]) if hours else None
