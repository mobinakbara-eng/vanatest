"""Staggered scheduling: main page first, satellites spread over the following hours/days.

Rules enforced here:
- satellites always post after the main page (delay window from config)
- no two brand pages post within `min_gap_minutes_between_pages`
- nothing during quiet hours
- per-page daily cap
- only a subset of satellites carry any given post
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .config import ScheduleRules


def _in_quiet(dt: datetime, rules: ScheduleRules) -> bool:
    start, end = rules.quiet_hours
    return start <= dt.hour < end if start < end else (dt.hour >= start or dt.hour < end)


def _push_out_of_quiet(dt: datetime, rules: ScheduleRules) -> datetime:
    while _in_quiet(dt, rules):
        dt = (dt + timedelta(hours=1)).replace(minute=random.randint(0, 59))
    return dt


def next_main_slot(rules: ScheduleRules, now: datetime | None = None, hour: int | None = None) -> datetime:
    tz = ZoneInfo(rules.timezone)
    now = now or datetime.now(tz)
    h = rules.main_post_hour if hour is None else hour
    slot = now.replace(hour=h, minute=random.randint(0, 20), second=0, microsecond=0)
    if slot <= now + timedelta(minutes=30):
        slot += timedelta(days=1)
    return slot


def pick_satellites(satellites: list, rules: ScheduleRules, rng: random.Random | None = None) -> list:
    rng = rng or random
    k = min(len(satellites), rules.max_satellites_per_post)
    if k == 0:
        return []
    k = rng.randint(max(1, k - 1), k)
    return rng.sample(satellites, k)


def plan(main_time: datetime, page_ids: list[str], rules: ScheduleRules,
         existing: dict[str, list[datetime]] | None = None,
         rng: random.Random | None = None) -> dict[str, datetime]:
    """Return {page_id: time}. `existing` holds already-scheduled times per page (for caps/gaps)."""
    rng = rng or random.Random()
    existing = {k: list(v) for k, v in (existing or {}).items()}
    taken = sorted(t for ts in existing.values() for t in ts) + [main_time]
    gap = timedelta(minutes=rules.min_gap_minutes_between_pages)
    lo, hi = rules.satellite_delay_hours
    out: dict[str, datetime] = {}

    for pid in page_ids:
        for _ in range(200):
            t = main_time + timedelta(minutes=rng.randint(lo * 60, hi * 60))
            t = _push_out_of_quiet(t, rules)
            same_day = [x for x in existing.get(pid, []) if x.date() == t.date()]
            if len(same_day) >= rules.max_posts_per_page_per_day:
                continue
            if all(abs(t - x) >= gap for x in taken):
                break
        else:
            raise RuntimeError(f"could not find a slot for {pid}; widen satellite_delay_hours or lower satellite count")
        out[pid] = t
        taken.append(t)
        existing.setdefault(pid, []).append(t)
    return out
