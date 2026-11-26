"""Load brands.yaml and enforce the guardrails that keep the network transparent."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator


class Page(BaseModel):
    handle_instagram: Optional[str] = None
    handle_tiktok: Optional[str] = None
    postiz_integration_ids: dict[str, str] = Field(default_factory=dict)
    ig_user_id: Optional[str] = None

    @property
    def platforms(self) -> list[str]:
        out = []
        if self.handle_instagram:
            out.append("instagram")
        if self.handle_tiktok:
            out.append("tiktok")
        return out

    def handle(self, platform: str) -> Optional[str]:
        return self.handle_instagram if platform == "instagram" else self.handle_tiktok


class Satellite(Page):
    id: str
    angle: str
    bio_disclosure: str

    @field_validator("bio_disclosure")
    @classmethod
    def must_disclose(cls, v: str) -> str:
        if "@" not in v or len(v.strip()) < 8:
            raise ValueError(
                "bio_disclosure must name the main page (e.g. 'Official tips page of @brand'). "
                "Satellites must openly say they belong to the brand."
            )
        return v


class Brand(BaseModel):
    id: str
    name: str
    language: str = "en"
    market: str = "US"
    audience: str
    voice: str
    topics: list[str]
    subreddits: list[str] = Field(default_factory=list)
    main: Page
    satellites: list[Satellite] = Field(default_factory=list)

    @model_validator(mode="after")
    def disclosure_names_main(self) -> "Brand":
        mains = {h.lower() for h in (self.main.handle_instagram, self.main.handle_tiktok) if h}
        for s in self.satellites:
            if not any(m in s.bio_disclosure.lower() for m in mains):
                raise ValueError(f"satellite {s.id}: bio_disclosure must mention the main handle {sorted(mains)}")
        return self


class ScheduleRules(BaseModel):
    timezone: str = "UTC"
    main_post_hour: int = 19
    satellite_delay_hours: tuple[int, int] = (2, 30)
    min_gap_minutes_between_pages: int = 90
    quiet_hours: tuple[int, int] = (1, 8)
    max_posts_per_page_per_day: int = 2
    max_satellites_per_post: int = 3


class Publishing(BaseModel):
    provider: str = "dryrun"
    postiz_base_url: str = "https://api.postiz.com/public/v1"


class Settings(BaseModel):
    brands: list[Brand]
    schedule: ScheduleRules = ScheduleRules()
    publishing: Publishing = Publishing()

    def brand(self, brand_id: str) -> Brand:
        for b in self.brands:
            if b.id == brand_id:
                return b
        raise KeyError(brand_id)


def load(path: str | Path = "config/brands.yaml") -> Settings:
    with open(path, encoding="utf-8") as f:
        return Settings.model_validate(yaml.safe_load(f))
