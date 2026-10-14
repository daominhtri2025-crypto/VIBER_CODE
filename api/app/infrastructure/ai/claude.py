"""Anthropic Claude adapter for TutorAI (decision 14/10/2026: Claude Haiku 5.5).

Plain HTTPS via httpx against the documented Messages API:
POST https://api.anthropic.com/v1/messages, headers ``x-api-key``,
``anthropic-version: 2023-06-01``; structured output via
``output_config.format = {"type": "json_schema", ...}``
(https://platform.claude.com/docs/en/api/messages, checked 14/10/2026).
No retries here: one bounded attempt, then the caller falls back to templates.
"""
from __future__ import annotations

import json
from dataclasses import asdict

import httpx

from app.domain.tutor_ai import OUTPUT_JSON_SCHEMA, TutorAIError, TutorCall, TutorContext, TutorOutput

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class ClaudeTutorAI:
    provider = "anthropic"

    def __init__(self, api_key: str, *, client: httpx.Client | None = None):
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required")
        self._key = api_key
        self._client = client or httpx.Client()

    def generate(self, ctx: TutorContext, *, model: str, system_prompt: str, timeout: float,
                 max_output_tokens: int) -> TutorCall:
        body = {
            "model": model,
            "max_tokens": max_output_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": json.dumps(
                {k: (str(v) if v is not None else None) for k, v in asdict(ctx).items()}, ensure_ascii=False)}],
            "output_config": {"format": {"type": "json_schema", "schema": OUTPUT_JSON_SCHEMA}},
        }
        try:
            resp = self._client.post(API_URL, json=body, timeout=timeout, headers={
                "x-api-key": self._key, "anthropic-version": API_VERSION, "content-type": "application/json"})
        except httpx.TimeoutException as exc:
            raise TutorAIError("timeout") from exc
        except httpx.HTTPError as exc:
            raise TutorAIError("transport", type(exc).__name__) from exc
        if resp.status_code != 200:
            # 429 rate limit / 529 overloaded / 5xx: no retry, template fallback instead.
            raise TutorAIError("transport", f"HTTP {resp.status_code}")
        try:
            data = resp.json()
            if data.get("stop_reason") == "refusal":
                raise TutorAIError("refusal")
            text = next(b["text"] for b in data["content"] if b.get("type") == "text")
            parsed = json.loads(text)
            usage = data.get("usage", {})
            return TutorCall(
                TutorOutput(feedback=str(parsed["feedback"]), question=str(parsed["question"]),
                            hint_level=int(parsed["hint_level"]),
                            needs_teacher_review=bool(parsed["needs_teacher_review"])),
                int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0)))
        except TutorAIError:
            raise
        except (KeyError, StopIteration, ValueError, TypeError) as exc:
            raise TutorAIError("bad_output", type(exc).__name__) from exc
