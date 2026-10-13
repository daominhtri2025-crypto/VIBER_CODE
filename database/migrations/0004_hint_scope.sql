-- Migration 0004 — Hint scope (HintPolicy, decision Q8: levels are counted per solving step).
--
-- scope values written by SessionService:
--   'IDENTIFY_KNOWLEDGE' | 'PROPOSE_PLAN' | 'VERIFY_RESULT'
--   'SOLVE_STEP:<anchor>' where <anchor> = id of the last valid transformation step, or 'start'.
-- Legacy rows keep NULL (unknown scope). Applied inside the runner's transaction.

ALTER TABLE hint_events ADD COLUMN scope TEXT CHECK(scope IS NULL OR length(scope) BETWEEN 1 AND 100);
CREATE INDEX idx_hint_events_scope ON hint_events(session_id, scope);
