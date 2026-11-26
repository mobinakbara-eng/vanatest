import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from engine.config import Brand, ScheduleRules
from engine.scheduler import plan, pick_satellites
from engine.store import Store
from engine import analytics

TZ = ZoneInfo("Asia/Tehran")
RULES = ScheduleRules(timezone="Asia/Tehran")


def brand(disclosure="Official tips page of @democafe"):
    return Brand.model_validate({
        "id": "b", "name": "B", "audience": "a", "voice": "v", "topics": ["x"],
        "main": {"handle_instagram": "democafe"},
        "satellites": [{"id": "s1", "angle": "tips", "handle_instagram": "democafe.tips",
                        "bio_disclosure": disclosure}],
    })


def test_satellite_requires_disclosure_of_main():
    brand()
    with pytest.raises(ValidationError):
        brand("just a fan page")
    with pytest.raises(ValidationError):
        brand("Official page of @someoneelse")


def test_schedule_respects_rules():
    rng = random.Random(1)
    main = datetime(2026, 12, 1, 19, 0, tzinfo=TZ)
    pages = ["s1", "s2", "s3"]
    for _ in range(50):
        t = plan(main, pages, RULES, rng=rng)
        times = sorted(list(t.values()) + [main])
        for a, b in zip(times, times[1:]):
            assert b - a >= timedelta(minutes=RULES.min_gap_minutes_between_pages)
        for x in t.values():
            assert x > main
            assert not (1 <= x.hour < 8)
            assert x - main <= timedelta(hours=RULES.satellite_delay_hours[1] + 8)


def test_pick_satellites_subset():
    sats = list(range(6))
    for _ in range(20):
        k = len(pick_satellites(sats, RULES))
        assert 1 <= k <= RULES.max_satellites_per_post


def test_analytics_summary(tmp_path):
    s = Store(tmp_path / "t.db")
    for i, (hook, views) in enumerate([("question", 1000), ("question", 3000), ("list", 200)]):
        pid = s.add_post(brand_id="b", page_id="main", is_main=1, platform="instagram",
                         scheduled_at=f"2026-12-0{i+1}T19:00:00", payload={}, hook_type=hook, format="reel", topic="t")
        s.execute("INSERT INTO metrics (post_id, views, likes, comments, saves, shares) VALUES (?,?,?,?,?,?)",
                  (pid, views, 10, 1, 2, 3))
    out = analytics.summary(s, "b")
    assert out["hook_type"][0]["value"] == "question"
    assert "question" in analytics.summary_text(out)
