"""Command line: python -m engine.cli <command> --brand <id>

  scout     fetch trends
  ideate    generate and score ideas from trends + past performance
  plan      take the best new idea, generate main + satellite versions, schedule them
  publish   send due posts to the publisher (dry-run or Postiz)
  collect   pull metrics (Instagram API; --csv for TikTok exports)
  report    print what is working
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from . import ai, analytics, publisher, scheduler, trends
from .config import load
from .store import Store


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["scout", "ideate", "plan", "publish", "collect", "report"])
    ap.add_argument("--brand")
    ap.add_argument("--config", default="config/brands.yaml")
    ap.add_argument("--db", default="data/engine.db")
    ap.add_argument("--csv", help="metrics CSV for `collect`")
    ap.add_argument("--approve", action="store_true", help="mark planned posts approved immediately")
    a = ap.parse_args(argv)

    cfg = load(a.config)
    store = Store(a.db)
    brands = [cfg.brand(a.brand)] if a.brand else cfg.brands
    tz = ZoneInfo(cfg.schedule.timezone)

    for b in brands:
        if a.command == "scout":
            print(f"{b.id}: {trends.scout(b, store)} new trends")

        elif a.command == "ideate":
            ts = [f"{r['title']} ({r['source']})" for r in store.query(
                "SELECT * FROM trends WHERE brand_id=? ORDER BY fetched_at DESC LIMIT 60", (b.id,))]
            perf = analytics.summary_text(analytics.summary(store, b.id))
            for i in ai.generate_ideas(b, ts, perf):
                store.execute("INSERT INTO ideas (brand_id,title,hook,format,topic,score,rationale) VALUES (?,?,?,?,?,?,?)",
                              (b.id, i.title, f"{i.hook_type}|{i.hook}", i.format, i.topic, i.score, i.rationale))
                print(f"  [{i.score:.1f}] {i.title}")

        elif a.command == "plan":
            row = store.query("SELECT * FROM ideas WHERE brand_id=? AND status='new' ORDER BY score DESC LIMIT 1", (b.id,))
            if not row:
                print(f"{b.id}: no new ideas; run ideate"); continue
            r = row[0]
            hook_type, hook = r["hook"].split("|", 1)
            idea = ai.Idea(title=r["title"], hook=hook, hook_type=hook_type, format=r["format"],
                           topic=r["topic"], score=r["score"], rationale=r["rationale"])
            chosen = scheduler.pick_satellites(b.satellites, cfg.schedule)
            sat_targets = [{"id": s.id, "platform": p, "handle": s.handle(p), "angle": s.angle}
                           for s in chosen for p in s.platforms]
            variations = ai.generate_pack(b, idea, sat_targets)

            hour = analytics.best_hour(analytics.summary(store, b.id))
            main_t = scheduler.next_main_slot(cfg.schedule, datetime.now(tz), hour)
            existing: dict[str, list[datetime]] = {}
            for p in store.query("SELECT page_id, scheduled_at FROM posts WHERE status IN ('draft','approved','queued')"):
                existing.setdefault(p["page_id"], []).append(datetime.fromisoformat(p["scheduled_at"]))
            times = scheduler.plan(main_t, [s.id for s in chosen], cfg.schedule, existing)
            times["main"] = main_t

            sats = {s.id: s for s in b.satellites}
            status = "approved" if a.approve else "draft"
            for v in variations:
                page = b.main if v.page_id == "main" else sats.get(v.page_id)
                if page is None or v.platform not in page.platforms:
                    continue
                payload = v.model_dump()
                if v.page_id != "main":
                    payload["settings"] = {"collaborators": [b.main.handle(v.platform)]} if v.platform == "instagram" else {}
                pid = store.add_post(idea_id=r["id"], brand_id=b.id, page_id=v.page_id, is_main=int(v.page_id == "main"),
                                     platform=v.platform, scheduled_at=times[v.page_id].isoformat(), payload=payload,
                                     status=status, hook_type=hook_type, format=r["format"], topic=r["topic"])
                print(f"  post {pid}: {v.page_id}/{v.platform} at {times[v.page_id]:%a %H:%M}")
            store.execute("UPDATE ideas SET status='planned' WHERE id=?", (r["id"],))
            if not a.approve:
                print("  drafts created. Review them, then: UPDATE posts SET status='approved' (or re-run with --approve)")

        elif a.command == "publish":
            pub = publisher.get(cfg.publishing.provider, cfg.publishing.postiz_base_url)
            now = datetime.now(tz)
            sats = {s.id: s for s in b.satellites}
            # Postiz handles the exact time, so queue anything approved within the next 48h
            for p in store.query("SELECT * FROM posts WHERE brand_id=? AND status='approved'", (b.id,)):
                if (datetime.fromisoformat(p["scheduled_at"]) - now).total_seconds() > 48 * 3600:
                    continue
                page = b.main if p["page_id"] == "main" else sats[p["page_id"]]
                post = dict(p) | {"payload": json.loads(p["payload"]),
                                  "integration_id": page.postiz_integration_ids.get(p["platform"])}
                ext = pub.publish(post)
                store.execute("UPDATE posts SET status='queued', external_id=? WHERE id=?", (ext, p["id"]))
                print(f"  queued post {p['id']} -> {ext}")

        elif a.command == "collect":
            n = analytics.import_csv(store, a.csv) if a.csv else analytics.collect_instagram(store)
            print(f"{b.id}: {n} metric rows")
            break  # metrics are global, run once

        elif a.command == "report":
            print(f"== {b.name} ==")
            print(analytics.summary_text(analytics.summary(store, b.id)) or "no metrics yet")


if __name__ == "__main__":
    main()
