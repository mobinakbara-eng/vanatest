"""Trend scouting from public sources: Google Trends daily RSS and Reddit top posts."""
from __future__ import annotations

from defusedxml import ElementTree as ET

import requests

from .config import Brand
from .store import Store

UA = {"User-Agent": "brand-constellation-trend-scout/1.0"}


def google_trends(geo: str) -> list[dict]:
    url = f"https://trends.google.com/trending/rss?geo={geo}"
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {"ht": "https://trends.google.com/trending/rss"}
    out = []
    for item in root.iter("item"):
        out.append({
            "source": "google_trends",
            "title": (item.findtext("title") or "").strip(),
            "url": item.findtext("link") or "",
            "traffic": item.findtext("ht:approx_traffic", default="", namespaces=ns),
        })
    return out


def reddit_top(subreddit: str, limit: int = 15) -> list[dict]:
    url = f"https://www.reddit.com/r/{subreddit}/top.json?t=week&limit={limit}"
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    return [{
        "source": f"reddit/{subreddit}",
        "title": c["data"]["title"],
        "url": "https://reddit.com" + c["data"]["permalink"],
        "traffic": str(c["data"].get("score", "")),
    } for c in r.json()["data"]["children"]]


def scout(brand: Brand, store: Store) -> int:
    items: list[dict] = []
    for fn, args in [(google_trends, (brand.market,))] + [(reddit_top, (s,)) for s in brand.subreddits]:
        try:
            items += fn(*args)
        except Exception as e:  # one dead source must not stop the run
            print(f"[trends] {fn.__name__}{args} failed: {e}")
    n = 0
    for t in items:
        cur = store.execute(
            "INSERT OR IGNORE INTO trends (brand_id, source, title, url, traffic) VALUES (?,?,?,?,?)",
            (brand.id, t["source"], t["title"], t["url"], t["traffic"]),
        )
        n += cur.rowcount
    return n
