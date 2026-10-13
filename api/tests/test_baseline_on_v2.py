"""Re-run the 18 shipped baseline tests against a database migrated to v2.

Proves migration 0002 does not weaken any v1 guarantee. The original
``tests.py`` is loaded unchanged (under another module name, to avoid
clashing with this ``tests`` package); only ``setUp`` swaps in the migrated DB.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

from app.infrastructure.sqlite.migrations import BASELINE_DIR, initialize


def _load_baseline():
    sys.path.insert(0, str(BASELINE_DIR))  # baseline imports db / init_db / session_repository
    try:
        spec = importlib.util.spec_from_file_location("baseline_v1_tests", BASELINE_DIR / "tests.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        import db as baseline_db  # noqa: PLC0415
        return module, baseline_db
    finally:
        sys.path.remove(str(BASELINE_DIR))


_baseline, _baseline_db = _load_baseline()


class TestBaselineOnV2(_baseline.DatabaseTests):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "test.db"
        initialize(self.path, demo=True)  # v1 baseline + seed -> migrate to v2
        self.c = _baseline_db.connect(self.path)  # legacy connection style the shipped tests expect
        assert self.c.execute("SELECT max(version) FROM schema_migrations").fetchone()[0] == 2
