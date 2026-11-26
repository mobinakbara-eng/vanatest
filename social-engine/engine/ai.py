"""Claude-powered idea scoring and content generation (structured outputs)."""
from __future__ import annotations

from typing import Literal

import anthropic
from pydantic import BaseModel

from .config import Brand

MODEL = "claude-opus-5-5"
_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


HookType = Literal["question", "bold_claim", "pov", "before_after", "list", "story", "tutorial", "trend_remix"]
Format = Literal["reel_talking", "reel_broll", "carousel", "photo", "reel_tutorial", "reel_trend_audio"]


class Idea(BaseModel):
    title: str
    hook: str
    hook_type: HookType
    format: Format
    topic: str
    score: float          # 0-10 predicted performance for this brand
    rationale: str


class IdeaBatch(BaseModel):
    ideas: list[Idea]


class Variation(BaseModel):
    page_id: str          # "main" or satellite id
    platform: Literal["instagram", "tiktok"]
    hook: str
    script: str           # shot list / voiceover
    caption: str
    hashtags: list[str]
    edit_notes: str       # how this cut differs visually from the others


class ContentPack(BaseModel):
    variations: list[Variation]


def _call(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    resp = client().messages.parse(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": "medium"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"model returned no content (stop_reason={resp.stop_reason})")
    return resp.parsed_output


def generate_ideas(brand: Brand, trends: list[str], performance_summary: str, n: int = 8) -> list[Idea]:
    system = (
        "You are a senior short-form social strategist for Instagram Reels and TikTok. "
        "You only propose original ideas a real brand can film; no misleading claims, no fake testimonials."
    )
    prompt = f"""Brand: {brand.name}
Language: {brand.language} | Market: {brand.market}
Audience: {brand.audience}
Voice: {brand.voice}
Core topics: {", ".join(brand.topics)}

Current trends (title / source):
{chr(10).join("- " + t for t in trends[:60]) or "- (none fetched)"}

What has worked for this brand so far (from our analytics):
{performance_summary or "No data yet: explore a wide mix of hook types and formats."}

Propose {n} post ideas. Only use a trend if it genuinely fits the brand. Lean toward hook types and
formats that performed well, but keep ~25% exploratory ideas so we keep learning.
Write hooks and titles in the brand language. Score each 0-10 for expected performance."""
    return _call(system, prompt, IdeaBatch).ideas


def generate_pack(brand: Brand, idea: Idea, satellites: list[dict]) -> list[Variation]:
    sats = "\n".join(
        f"- page_id={s['id']} platform={s['platform']} handle=@{s['handle']} angle: {s['angle']}" for s in satellites
    )
    main_handles = ", ".join(f"{p}=@{brand.main.handle(p)}" for p in brand.main.platforms)
    system = (
        "You write short-form video packs for a brand that runs one main page plus several official, "
        "openly brand-owned satellite pages. Every satellite version must be a genuinely different cut "
        "(different hook, angle, framing and caption), never a copy of the main post, because both "
        "Instagram and TikTok down-rank duplicated/unoriginal content. Satellite captions must credit and "
        "tag the main page naturally and must never pretend to be an independent fan or customer."
    )
    prompt = f"""Brand: {brand.name} ({brand.language}), voice: {brand.voice}
Main page handles: {main_handles}
Idea: {idea.model_dump_json()}

Produce:
1. One variation per main platform with page_id="main".
2. One variation for each of these satellite pages, fitted to its angle:
{sats or "(no satellites selected)"}

Captions in {brand.language}. 3-6 relevant hashtags each (no banned or spammy tags)."""
    return _call(system, prompt, ContentPack).variations
