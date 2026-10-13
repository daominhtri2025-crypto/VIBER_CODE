"""Rubric files are immutable per version: content must match MANIFEST checksum."""
import hashlib
import json

from app.infrastructure.sqlite.migrations import REPO_ROOT

RUBRIC_DIR = REPO_ROOT / "content" / "rubrics"


def test_rubric_checksums_match_manifest():
    manifest = json.loads((RUBRIC_DIR / "MANIFEST.json").read_text(encoding="utf-8"))
    for entry in manifest["rubrics"]:
        data = (RUBRIC_DIR / entry["file"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry["sha256"], entry["rubric_version"]
        assert json.loads(data)["rubric_version"] == entry["rubric_version"]


def test_explanation_rubric_matches_seeded_item_maximum():
    rubric = json.loads((RUBRIC_DIR / "explanation-rubric-v1.json").read_text(encoding="utf-8"))
    assert [lv["score"] for lv in rubric["levels"]] == list(range(rubric["max_score"] + 1))
    assert rubric["max_score"] == 3  # seed: assessment_items.max_explanation_score = 3
