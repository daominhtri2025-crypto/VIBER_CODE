-- Migration 0002 — Phase 1 integrity gaps (handoff §4.6 + baseline review).
--
-- Applied by app.infrastructure.sqlite.migrations inside ONE transaction that
-- the runner opens (BEGIN IMMEDIATE) and commits only after
-- integrity_check / foreign_key_check pass. Do NOT add BEGIN/COMMIT here.
--
-- Only additive operations (ADD COLUMN, CREATE TABLE/INDEX/TRIGGER, and
-- recreating one trigger) — no table rebuild, so existing rows, steps, hints
-- and scores are untouched.

------------------------------------------------------------------------------
-- 0. Migration bookkeeping: record name + checksum for tamper detection.
------------------------------------------------------------------------------
ALTER TABLE schema_migrations ADD COLUMN name TEXT;
ALTER TABLE schema_migrations ADD COLUMN checksum TEXT;
UPDATE schema_migrations SET name = 'baseline_schema_v1' WHERE version = 1;

------------------------------------------------------------------------------
-- 1. Session lineage: guided session -> independent practice session, and
--    optional study scope (handoff §4.6 bullet 1, §5.1).
------------------------------------------------------------------------------
ALTER TABLE learning_sessions ADD COLUMN parent_session_id TEXT REFERENCES learning_sessions(id);
ALTER TABLE learning_sessions ADD COLUMN study_id TEXT REFERENCES studies(id);
CREATE INDEX idx_sessions_parent ON learning_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
CREATE INDEX idx_sessions_study ON learning_sessions(study_id, student_id) WHERE study_id IS NOT NULL;

CREATE TRIGGER check_session_lineage BEFORE INSERT ON learning_sessions
 WHEN NEW.parent_session_id IS NOT NULL OR NEW.study_id IS NOT NULL
 BEGIN
  SELECT CASE WHEN NEW.parent_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM learning_sessions p WHERE p.id = NEW.parent_session_id AND p.student_id = NEW.student_id)
   THEN RAISE(ABORT, 'Parent session must belong to the same student') END;
  SELECT CASE WHEN NEW.parent_session_id IS NOT NULL AND NEW.learning_mode <> 'independent'
   THEN RAISE(ABORT, 'Child of a learning session must be independent practice') END;
  SELECT CASE WHEN NEW.parent_session_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM learning_sessions p WHERE p.id = NEW.parent_session_id AND p.problem_id = NEW.problem_id)
   THEN RAISE(ABORT, 'Independent practice must use a different problem') END;
  SELECT CASE WHEN NEW.parent_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM learning_sessions p WHERE p.id = NEW.parent_session_id
     AND p.state IN ('INDEPENDENT_PRACTICE', 'COMPLETED'))
   THEN RAISE(ABORT, 'Parent session must be in INDEPENDENT_PRACTICE or COMPLETED') END;
  SELECT CASE WHEN NEW.parent_session_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM learning_sessions p WHERE p.id = NEW.parent_session_id
     AND p.study_id IS NOT NEW.study_id)
   THEN RAISE(ABORT, 'Child session must inherit the parent study_id') END;
  SELECT CASE WHEN NEW.study_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM study_participants sp WHERE sp.study_id = NEW.study_id AND sp.student_id = NEW.student_id)
   THEN RAISE(ABORT, 'Student is not a participant of this study') END;
 END;

-- Recreate v1 identity freeze so it also covers the new lineage columns.
DROP TRIGGER freeze_session_identity;
CREATE TRIGGER freeze_session_identity
 BEFORE UPDATE OF student_id, problem_id, problem_version, assignment_id, learning_mode,
                  ai_config_id, parent_session_id, study_id ON learning_sessions
 BEGIN SELECT RAISE(ABORT, 'Session identity is immutable'); END;

------------------------------------------------------------------------------
-- 2. Hint idempotency (handoff §4.6 bullet 4). Legacy rows keep NULL; the
--    repository always supplies request_id for new hints.
------------------------------------------------------------------------------
ALTER TABLE hint_events ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX ux_hint_events_request ON hint_events(session_id, request_id)
 WHERE request_id IS NOT NULL;

------------------------------------------------------------------------------
-- 3. Append-only audit log (handoff §4.6 bullet 3, audit half).
--    actor_id intentionally has NO foreign key: audit rows must survive a
--    participant-withdrawal erasure of the users row.
--    (request_results for replaying HTTP/AI responses is deferred to Phase 3.)
------------------------------------------------------------------------------
CREATE TABLE audit_log(
 id TEXT PRIMARY KEY NOT NULL,
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 actor_id TEXT,
 action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 100),
 entity_type TEXT NOT NULL CHECK(length(entity_type) BETWEEN 1 AND 100),
 entity_id TEXT NOT NULL,
 request_id TEXT,
 details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details) AND length(details) <= 8000)
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, occurred_at);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, occurred_at);
CREATE TRIGGER freeze_audit_update BEFORE UPDATE ON audit_log
 BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;
CREATE TRIGGER freeze_audit_delete BEFORE DELETE ON audit_log
 BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;

------------------------------------------------------------------------------
-- 4. Lock assessment content once any attempt exists (handoff §4.6 bullet 5).
--    v1 already blocks UPDATE of items; here we block INSERT/DELETE too.
------------------------------------------------------------------------------
CREATE TRIGGER lock_assessment_items_insert BEFORE INSERT ON assessment_items
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE assessment_id = NEW.assessment_id)
 BEGIN SELECT RAISE(ABORT, 'Assessment already has attempts; items are locked'); END;
CREATE TRIGGER lock_assessment_items_delete BEFORE DELETE ON assessment_items
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE assessment_id = OLD.assessment_id)
 BEGIN SELECT RAISE(ABORT, 'Assessment already has attempts; items are locked'); END;
CREATE TRIGGER freeze_assessment_rubric BEFORE UPDATE OF study_id, phase, rubric_version ON assessments
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE assessment_id = OLD.id)
 BEGIN SELECT RAISE(ABORT, 'Assessment already has attempts; scope and rubric are locked'); END;

------------------------------------------------------------------------------
-- 5. Attempt / response lifecycle (gaps found in baseline review):
--    draft -> submitted (content frozen) -> graded (scores only, by an
--    authorised grader of the same study).
------------------------------------------------------------------------------
CREATE TRIGGER freeze_attempt_identity
 BEFORE UPDATE OF id, study_id, assessment_id, participant_id, attempt_no, started_at ON assessment_attempts
 BEGIN SELECT RAISE(ABORT, 'Attempt identity is immutable'); END;
CREATE TRIGGER freeze_attempt_submission BEFORE UPDATE OF submitted_at ON assessment_attempts
 WHEN OLD.submitted_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT, 'Submitted attempt cannot be reopened or re-dated'); END;
CREATE TRIGGER freeze_attempt_delete BEFORE DELETE ON assessment_attempts
 WHEN OLD.submitted_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT, 'Submitted attempt cannot be deleted'); END;

CREATE TRIGGER response_insert_lifecycle BEFORE INSERT ON item_responses
 BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE id = NEW.attempt_id AND submitted_at IS NOT NULL)
   THEN RAISE(ABORT, 'Attempt already submitted; responses are locked') END;
  SELECT CASE WHEN NEW.solution_score IS NOT NULL
   THEN RAISE(ABORT, 'Cannot grade before submission') END;
 END;
CREATE TRIGGER response_identity_freeze BEFORE UPDATE OF id, attempt_id, assessment_id, item_id ON item_responses
 BEGIN SELECT RAISE(ABORT, 'Response identity is immutable'); END;
CREATE TRIGGER response_content_freeze BEFORE UPDATE OF solution, explanation ON item_responses
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE id = OLD.attempt_id AND submitted_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT, 'Attempt already submitted; responses are locked'); END;
CREATE TRIGGER response_grade_lifecycle BEFORE UPDATE OF solution_score, explanation_score, grader_id ON item_responses
 WHEN NEW.grader_id IS NOT NULL
 BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM assessment_attempts WHERE id = NEW.attempt_id AND submitted_at IS NOT NULL)
   THEN RAISE(ABORT, 'Cannot grade before submission') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM assessment_attempts a JOIN study_researchers sr ON sr.study_id = a.study_id
    WHERE a.id = NEW.attempt_id AND sr.researcher_id = NEW.grader_id)
   THEN RAISE(ABORT, 'Grader is not assigned to this study') END;
 END;
CREATE TRIGGER response_delete_lock BEFORE DELETE ON item_responses
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE id = OLD.attempt_id AND submitted_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT, 'Attempt already submitted; responses are locked'); END;
