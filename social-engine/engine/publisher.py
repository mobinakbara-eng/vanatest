"""Publishing adapters. Only official channels: Postiz (which uses each platform's official API) or dry-run.

No adapter in this project performs likes, follows, comments or any engagement between brand pages;
the engine only publishes each page's own content.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests


class DryRun:
    def __init__(self, out_dir: str = "data/outbox"):
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)

    def publish(self, post: dict) -> str:
        path = self.out / f"post_{post['id']}.json"
        path.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")
        return f"dryrun:{path}"


class Postiz:
    """Postiz public API (self-hosted or cloud). Verify field names against your Postiz version's
    docs (docs.postiz.com > Public API) before switching provider to `postiz`."""

    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        key = os.environ.get("POSTIZ_API_KEY")
        if not key:
            raise RuntimeError("POSTIZ_API_KEY not set")
        self.headers = {"Authorization": key, "Content-Type": "application/json"}

    def publish(self, post: dict) -> str:
        payload = post["payload"]
        body = {
            "type": "schedule",
            "date": post["scheduled_at"],
            "shortLink": False,
            "tags": [],
            "posts": [{
                "integration": {"id": post["integration_id"]},
                "value": [{"content": payload["caption"] + "\n\n" + " ".join(payload["hashtags"]),
                           "image": payload.get("media", [])}],
                "settings": payload.get("settings", {}),
            }],
        }
        r = requests.post(f"{self.base}/posts", headers=self.headers, json=body, timeout=30)
        r.raise_for_status()
        data = r.json()
        return str(data[0].get("postId") if isinstance(data, list) else data.get("id", data))


def get(provider: str, base_url: str):
    return Postiz(base_url) if provider == "postiz" else DryRun()
