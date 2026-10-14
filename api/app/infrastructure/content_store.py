"""Checksum-verified loader for teacher-approved content in ``content/``.

Every JSON file must be listed in its directory's ``MANIFEST.json`` with a
matching SHA-256; otherwise loading fails. Content is immutable per version —
a change means a new file and a new checksum (see .gitattributes: LF only).
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from app.domain.errors import NotFound

CONTENT_ROOT = Path(__file__).resolve().parents[3] / "content"


class ContentIntegrityError(RuntimeError):
    pass


class ContentStore:
    def __init__(self, root: Path = CONTENT_ROOT):
        self.root = root

    @lru_cache(maxsize=256)
    def _load(self, subdir: str, filename: str) -> dict:
        return json.loads(self._verified_bytes(subdir, filename))

    @lru_cache(maxsize=64)
    def _verified_bytes(self, subdir: str, filename: str) -> bytes:
        directory = self.root / subdir
        manifest = json.loads((directory / "MANIFEST.json").read_text(encoding="utf-8"))
        entry = next((e for e in manifest["files"] if e["file"] == filename), None)
        path = directory / filename
        if entry is None or not path.is_file():
            raise NotFound(f"Content not found: {subdir}/{filename}")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ContentIntegrityError(f"Checksum mismatch: {subdir}/{filename}")
        return data

    def manifest(self, subdir: str) -> dict:
        return json.loads((self.root / subdir / "MANIFEST.json").read_text(encoding="utf-8"))

    def problem(self, problem_id: str, version: int) -> dict:
        return self._load("problems", f"{problem_id}@{version}.json")

    def templates(self, version: str = "v1") -> dict:
        return self._load("feedback", f"templates-{version}.json")

    def prompt(self, prompt_version: str) -> str:
        """System prompt text for ``ai_configs.prompt_version`` (e.g. 'tutor-system-v1')."""
        return self._verified_bytes("prompts", f"{prompt_version}.md").decode("utf-8")
